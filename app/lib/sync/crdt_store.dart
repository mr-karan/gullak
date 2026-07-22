import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../data/db/database.dart';
import 'crdt.dart';
import 'crdt_resources.dart';

typedef CrdtFaultInjector = void Function(String point);

final class RemoteCrdtChange {
  const RemoteCrdtChange({
    required this.envelope,
    required this.serverCursor,
    this.originalBytes,
  });

  final Object? envelope;
  final int serverCursor;
  final Uint8List? originalBytes;
}

final class CrdtConflictSummary {
  const CrdtConflictSummary({
    required this.resource,
    required this.entityId,
    required this.field,
    required this.candidateCount,
    required this.winner,
  });

  final String resource;
  final String entityId;
  final String field;
  final int candidateCount;
  final Candidate winner;
}

final class CrdtRemotePageResult {
  const CrdtRemotePageResult({
    required this.accepted,
    required this.duplicates,
    required this.quarantined,
    required this.pullCursor,
    required this.conflicts,
  });

  final int accepted;
  final int duplicates;
  final int quarantined;
  final int pullCursor;
  final List<CrdtConflictSummary> conflicts;
}

/// A missing causal predecessor. The caller must retry without advancing the
/// transport cursor; it is not a poison event and must never be quarantined.
final class CrdtRetryableGap implements Exception {
  const CrdtRetryableGap(this.message);

  final String message;

  @override
  String toString() => 'CrdtRetryableGap: $message';
}

final class CrdtStoreException implements Exception {
  const CrdtStoreException(this.message);

  final String message;

  @override
  String toString() => 'CrdtStoreException: $message';
}

final class _PermanentRemoteException implements Exception {
  const _PermanentRemoteException(this.code, this.message);

  final String code;
  final String message;
}

final class _PreparedChange {
  const _PreparedChange({
    required this.envelope,
    required this.envelopeJson,
    required this.contentHash,
  });

  final ChangeEnvelope envelope;
  final String envelopeJson;
  final String contentHash;
}

enum _IntegratedStatus { accepted, duplicate }

final class _IntegratedChange {
  const _IntegratedChange(this.status, this.conflicts);

  final _IntegratedStatus status;
  final List<CrdtConflictSummary> conflicts;
}

/// Drift-backed protocol-v2 CRDT engine.
///
/// All mutation entry points own a Drift transaction. Repository integration
/// should call [authorLocalChange] instead of writing synced domain tables.
final class CrdtStore {
  CrdtStore(
    this._db, {
    Uuid uuid = const Uuid(),
    int Function()? nowMs,
    CrdtFaultInjector? faultInjector,
  }) : _uuid = uuid,
       _nowMs = nowMs ?? (() => DateTime.now().millisecondsSinceEpoch),
       _faultInjector = faultInjector;

  final AppDatabase _db;
  final Uuid _uuid;
  final int Function() _nowMs;
  final CrdtFaultInjector? _faultInjector;

  /// Initializes an empty replica or verifies the durable existing identity.
  /// Changing an initialized epoch requires a checkpoint/bootstrap workflow;
  /// this method intentionally refuses to reinterpret existing facts.
  Future<SyncReplicaStateRow> initializeReplica({
    required String epoch,
    String? actorId,
    int pullCursor = 0,
  }) => bootstrapEmptyReplica(
    epoch: epoch,
    actorId: actorId,
    pullCursor: pullCursor,
  );

  Future<SyncReplicaStateRow> bootstrapEmptyReplica({
    required String epoch,
    String? actorId,
    int pullCursor = 0,
  }) async {
    _requireNonEmpty(epoch, 'epoch');
    _requireSafeNonNegative(pullCursor, 'pullCursor');
    if (pullCursor != 0) {
      throw const CrdtStoreException(
        'an empty replica must start at cursor zero; non-zero cursors require '
        'a verified checkpoint',
      );
    }
    if (actorId != null) _requireNonEmpty(actorId, 'actorId');
    final now = _validNow();
    return _db.transaction(() async {
      final existing = await _replicaState();
      if (existing != null) {
        if (actorId != null && actorId != existing.actorId) {
          throw const CrdtStoreException(
            'replica actorId is durable and cannot be replaced',
          );
        }
        if (existing.epoch != null && existing.epoch != epoch) {
          throw CrdtStoreException(
            'replica is already initialized for epoch ${existing.epoch}',
          );
        }
        if (existing.epoch == epoch) return existing;
        await (_db.update(
          _db.syncReplicaState,
        )..where((row) => row.id.equals(1))).write(
          SyncReplicaStateCompanion(
            epoch: Value(epoch),
            pullCursor: Value(pullCursor),
            updatedAt: Value(now),
          ),
        );
        return (await _replicaState())!;
      }

      final durableActor = actorId ?? _uuid.v4();
      await _db
          .into(_db.syncReplicaState)
          .insert(
            SyncReplicaStateCompanion.insert(
              epoch: Value(epoch),
              actorId: durableActor,
              pullCursor: Value(pullCursor),
              updatedAt: now,
            ),
          );
      return (await _replicaState())!;
    });
  }

  /// Authors one immutable local user action and materializes all its targets
  /// atomically with sequence, frontier, Lamport, and outbox state.
  Future<ChangeEnvelope> authorLocalChange({
    required List<AssignOp> ops,
    int schemaVersion = 1,
    int? wallTimeMs,
  }) async {
    if (schemaVersion != crdtSupportedSchemaVersion) {
      throw CrdtStoreException(
        'schema version $schemaVersion is not supported by this client '
        '(expected $crdtSupportedSchemaVersion)',
      );
    }
    for (final op in ops) {
      validateCrdtFieldValue(op.resource, op.field, op.value);
    }
    final wallTime = wallTimeMs ?? _validNow();
    _requireSafeNonNegative(wallTime, 'wallTimeMs');

    return _db.transaction(() async {
      final state = await _requireReplica();
      final epoch = state.epoch!;
      final frontiers = await (_db.select(
        _db.syncFrontiers,
      )..where((row) => row.epoch.equals(epoch))).get();
      final context = <String, int>{
        for (final frontier in frontiers)
          if (frontier.contiguousSequence > 0)
            frontier.actorId: frontier.contiguousSequence,
      };
      final localFrontier = context[state.actorId] ?? 0;
      if (localFrontier != state.nextSequence - 1) {
        throw CrdtStoreException(
          'local sequence allocator ${state.nextSequence} disagrees with '
          'frontier $localFrontier',
        );
      }
      final causalLamport = await _expectedLamport(epoch, context);
      if (causalLamport != state.lamport + 1) {
        throw CrdtStoreException(
          'local Lamport ${state.lamport} disagrees with causal frontier '
          '${causalLamport - 1}',
        );
      }
      final sequence = state.nextSequence;
      final envelope = ChangeEnvelope(
        epoch: epoch,
        changeId: '${state.actorId}:$sequence',
        actorId: state.actorId,
        sequence: sequence,
        context: context,
        lamport: causalLamport,
        wallTimeMs: wallTime,
        schemaVersion: schemaVersion,
        ops: ops,
      );
      final prepared = _prepare(envelope);
      await _insertChange(
        prepared,
        outboxState: 'pending',
        serverCursor: null,
        createdAt: wallTime,
      );
      _fault('local.after_change');

      final conflicts = await _mergeAllOps(
        envelope,
        cursor: state.pullCursor,
        now: wallTime,
      );
      await materializeCrdtTargets(
        _db,
        epoch: epoch,
        targets: envelope.ops.map(
          (op) => (resource: op.resource, entityId: op.entityId),
        ),
      );
      _fault('local.after_materialize');
      await _upsertFrontier(
        epoch: epoch,
        actorId: state.actorId,
        sequence: sequence,
        cursor: state.pullCursor,
        now: wallTime,
      );
      await (_db.update(
        _db.syncReplicaState,
      )..where((row) => row.id.equals(1))).write(
        SyncReplicaStateCompanion(
          nextSequence: Value(sequence + 1),
          lamport: Value(causalLamport),
          updatedAt: Value(wallTime),
        ),
      );
      _fault('local.before_commit');
      // Force evaluation so a future refactor cannot accidentally drop this
      // work as an unused lazy computation.
      conflicts.length;
      return envelope;
    });
  }

  Future<CrdtRemotePageResult> integrateRemoteChange(
    Object? envelope, {
    required int serverCursor,
    Uint8List? originalBytes,
    String source = 'server',
  }) => integrateRemotePage(
    changes: [
      RemoteCrdtChange(
        envelope: envelope,
        serverCursor: serverCursor,
        originalBytes: originalBytes,
      ),
    ],
    nextCursor: serverCursor,
    source: source,
  );

  /// Integrates a transport page atomically. Causally reordered items are
  /// retried within the page. A dependency absent from the page rolls the
  /// entire page back; permanent malformed items are quarantined and do not
  /// prevent the final cursor commit.
  Future<CrdtRemotePageResult> integrateRemotePage({
    required List<RemoteCrdtChange> changes,
    required int nextCursor,
    String source = 'server',
  }) async {
    _requireSafeNonNegative(nextCursor, 'nextCursor');
    _requireNonEmpty(source, 'source');
    final receivedAt = _validNow();

    return _db.transaction(() async {
      var state = await _requireReplica();
      if (nextCursor < state.pullCursor) {
        throw CrdtStoreException(
          'pull cursor cannot move backwards from ${state.pullCursor} '
          'to $nextCursor',
        );
      }
      if (changes.any((change) => change.serverCursor > nextCursor)) {
        throw const CrdtStoreException(
          'a page item cursor cannot exceed the page nextCursor',
        );
      }
      var accepted = 0;
      var duplicates = 0;
      var quarantined = 0;
      final conflicts = <CrdtConflictSummary>[];
      var pending = List<RemoteCrdtChange>.from(changes);

      while (pending.isNotEmpty) {
        final deferred = <RemoteCrdtChange>[];
        var progressed = false;
        CrdtRetryableGap? lastGap;
        for (final remote in pending) {
          try {
            _requireSafeNonNegative(remote.serverCursor, 'serverCursor');
            final prepared = _prepare(_decodeEnvelope(remote.envelope));
            final integrated = await _db.transaction(
              () => _integratePreparedRemote(
                prepared,
                serverCursor: remote.serverCursor,
                receivedAt: receivedAt,
              ),
            );
            switch (integrated.status) {
              case _IntegratedStatus.accepted:
                accepted++;
              case _IntegratedStatus.duplicate:
                duplicates++;
            }
            conflicts.addAll(integrated.conflicts);
            progressed = true;
          } on CrdtRetryableGap catch (gap) {
            deferred.add(remote);
            lastGap = gap;
          } on _PermanentRemoteException catch (error) {
            await _quarantine(
              remote,
              source: source,
              code: error.code,
              reason: error.message,
              receivedAt: receivedAt,
            );
            quarantined++;
            progressed = true;
          } on CrdtValidationException catch (error) {
            await _quarantine(
              remote,
              source: source,
              code: 'invalid_envelope',
              reason: error.message,
              receivedAt: receivedAt,
            );
            quarantined++;
            progressed = true;
          } on CrdtProjectionException catch (error) {
            await _quarantine(
              remote,
              source: source,
              code: 'invalid_projection',
              reason: error.message,
              receivedAt: receivedAt,
            );
            quarantined++;
            progressed = true;
          } on FormatException catch (error) {
            await _quarantine(
              remote,
              source: source,
              code: 'invalid_json',
              reason: error.message,
              receivedAt: receivedAt,
            );
            quarantined++;
            progressed = true;
          }
        }
        if (deferred.isNotEmpty && !progressed) {
          throw lastGap ?? const CrdtRetryableGap('causal dependency missing');
        }
        pending = deferred;
      }

      state = await _requireReplica();
      await (_db.update(
        _db.syncReplicaState,
      )..where((row) => row.id.equals(1))).write(
        SyncReplicaStateCompanion(
          pullCursor: Value(nextCursor),
          updatedAt: Value(receivedAt),
        ),
      );
      _fault('remote.before_cursor_commit');
      return CrdtRemotePageResult(
        accepted: accepted,
        duplicates: duplicates,
        quarantined: quarantined,
        pullCursor: nextCursor,
        conflicts: List.unmodifiable(conflicts),
      );
    });
  }

  Future<_IntegratedChange> _integratePreparedRemote(
    _PreparedChange prepared, {
    required int serverCursor,
    required int receivedAt,
  }) async {
    final envelope = prepared.envelope;
    final replica = await _requireReplica();
    if (envelope.epoch != replica.epoch) {
      throw _PermanentRemoteException(
        'wrong_epoch',
        'change epoch ${envelope.epoch} does not match ${replica.epoch}',
      );
    }
    if (envelope.schemaVersion != crdtSupportedSchemaVersion) {
      throw _PermanentRemoteException(
        'unsupported_schema',
        'change schema ${envelope.schemaVersion} is not supported by this '
            'client (expected $crdtSupportedSchemaVersion)',
      );
    }
    for (final op in envelope.ops) {
      validateCrdtFieldValue(op.resource, op.field, op.value);
    }

    final cursorOwner = await (_db.select(
      _db.syncChanges,
    )..where((row) => row.serverCursor.equals(serverCursor))).getSingleOrNull();
    if (cursorOwner != null && cursorOwner.changeId != envelope.changeId) {
      throw _PermanentRemoteException(
        'cursor_reuse',
        'server cursor $serverCursor already belongs to '
            '${cursorOwner.changeId}',
      );
    }

    final identity =
        await (_db.select(_db.syncChanges)..where(
              (row) =>
                  row.changeId.equals(envelope.changeId) |
                  (row.actorId.equals(envelope.actorId) &
                      row.sequence.equals(envelope.sequence)),
            ))
            .getSingleOrNull();
    if (identity != null) {
      final exact =
          identity.changeId == envelope.changeId &&
          identity.actorId == envelope.actorId &&
          identity.sequence == envelope.sequence &&
          identity.contentHash == prepared.contentHash &&
          identity.envelopeJson == prepared.envelopeJson;
      if (!exact) {
        throw const _PermanentRemoteException(
          'identity_reuse',
          'changeId or actor sequence was reused with different bytes',
        );
      }
      if (identity.serverCursor != null &&
          identity.serverCursor != serverCursor) {
        throw _PermanentRemoteException(
          'cursor_reuse',
          'change ${envelope.changeId} was already assigned server cursor '
              '${identity.serverCursor}',
        );
      }
      await (_db.update(
        _db.syncChanges,
      )..where((row) => row.changeId.equals(envelope.changeId))).write(
        SyncChangesCompanion(
          outboxState: Value(
            identity.outboxState == 'remote' ? 'remote' : 'accepted',
          ),
          serverCursor: Value(serverCursor),
          acceptedAt: Value(receivedAt),
        ),
      );
      final existingFrontier = await _frontier(
        envelope.epoch,
        envelope.actorId,
      );
      if (existingFrontier != null &&
          existingFrontier.integratedCursor < serverCursor) {
        await (_db.update(_db.syncFrontiers)..where(
              (row) =>
                  row.epoch.equals(envelope.epoch) &
                  row.actorId.equals(envelope.actorId),
            ))
            .write(
              SyncFrontiersCompanion(
                integratedCursor: Value(serverCursor),
                updatedAt: Value(receivedAt),
              ),
            );
      }
      return const _IntegratedChange(_IntegratedStatus.duplicate, []);
    }

    final actorFrontier = await _frontier(envelope.epoch, envelope.actorId);
    final expectedSequence = (actorFrontier?.contiguousSequence ?? 0) + 1;
    if (envelope.sequence > expectedSequence) {
      if (await _hasQuarantinedDependency(
        epoch: envelope.epoch,
        actorId: envelope.actorId,
        afterSequence: expectedSequence - 1,
        throughSequence: envelope.sequence - 1,
      )) {
        throw _PermanentRemoteException(
          'quarantined_dependency',
          '${envelope.changeId} follows a permanently quarantined actor '
              'sequence',
        );
      }
      throw CrdtRetryableGap(
        '${envelope.actorId} expected sequence $expectedSequence, received '
        '${envelope.sequence}',
      );
    }
    if (envelope.sequence < expectedSequence) {
      throw _PermanentRemoteException(
        'sequence_reuse',
        '${envelope.actorId}:${envelope.sequence} is behind frontier '
            '${expectedSequence - 1} without an identical stored event',
      );
    }

    final allFrontiers = await (_db.select(
      _db.syncFrontiers,
    )..where((row) => row.epoch.equals(envelope.epoch))).get();
    final byActor = {
      for (final frontier in allFrontiers)
        frontier.actorId: frontier.contiguousSequence,
    };
    for (final dependency in envelope.context.entries) {
      final available = byActor[dependency.key] ?? 0;
      if (available < dependency.value) {
        if (await _hasQuarantinedDependency(
          epoch: envelope.epoch,
          actorId: dependency.key,
          afterSequence: available,
          throughSequence: dependency.value,
        )) {
          throw _PermanentRemoteException(
            'quarantined_dependency',
            '${envelope.changeId} depends on a permanently quarantined '
                'change from ${dependency.key}',
          );
        }
        throw CrdtRetryableGap(
          '${envelope.changeId} needs ${dependency.key}:${dependency.value}, '
          'frontier is $available',
        );
      }
    }
    final expectedLamport = await _expectedLamport(
      envelope.epoch,
      envelope.context,
    );
    if (envelope.lamport != expectedLamport) {
      throw _PermanentRemoteException(
        'invalid_lamport',
        '${envelope.changeId} lamport ${envelope.lamport} must equal '
            '$expectedLamport',
      );
    }

    await _insertChange(
      prepared,
      outboxState: 'remote',
      serverCursor: serverCursor,
      createdAt: receivedAt,
      acceptedAt: receivedAt,
    );
    _fault('remote.after_change');
    final conflicts = await _mergeAllOps(
      envelope,
      cursor: serverCursor,
      now: receivedAt,
    );
    await materializeCrdtTargets(
      _db,
      epoch: envelope.epoch,
      targets: envelope.ops.map(
        (op) => (resource: op.resource, entityId: op.entityId),
      ),
    );
    _fault('remote.after_materialize');
    await _upsertFrontier(
      epoch: envelope.epoch,
      actorId: envelope.actorId,
      sequence: envelope.sequence,
      cursor: serverCursor,
      now: receivedAt,
    );
    await (_db.update(
      _db.syncReplicaState,
    )..where((row) => row.id.equals(1))).write(
      SyncReplicaStateCompanion(
        nextSequence: envelope.actorId == replica.actorId
            ? Value(
                replica.nextSequence > envelope.sequence
                    ? replica.nextSequence
                    : envelope.sequence + 1,
              )
            : const Value.absent(),
        lamport: Value(
          envelope.lamport > replica.lamport
              ? envelope.lamport
              : replica.lamport,
        ),
        updatedAt: Value(receivedAt),
      ),
    );
    return _IntegratedChange(_IntegratedStatus.accepted, conflicts);
  }

  _PreparedChange _prepare(ChangeEnvelope envelope) {
    envelope.validate();
    final envelopeJson = envelope.canonicalJson();
    return _PreparedChange(
      envelope: envelope,
      envelopeJson: envelopeJson,
      contentHash: sha256.convert(utf8.encode(envelopeJson)).toString(),
    );
  }

  ChangeEnvelope _decodeEnvelope(Object? raw) {
    if (raw is ChangeEnvelope) return raw;
    Object? decoded = raw;
    if (raw is String) decoded = jsonDecode(raw);
    if (raw is Uint8List) decoded = jsonDecode(utf8.decode(raw));
    if (decoded is! Map) {
      throw const CrdtValidationException('change must be an object');
    }
    try {
      return ChangeEnvelope.fromJson(Map<String, Object?>.from(decoded));
    } on TypeError catch (error) {
      throw CrdtValidationException('invalid change object: $error');
    }
  }

  Future<void> _insertChange(
    _PreparedChange prepared, {
    required String outboxState,
    required int? serverCursor,
    required int createdAt,
    int? acceptedAt,
  }) async {
    final change = prepared.envelope;
    await _db
        .into(_db.syncChanges)
        .insert(
          SyncChangesCompanion.insert(
            changeId: change.changeId,
            epoch: change.epoch,
            actorId: change.actorId,
            sequence: change.sequence,
            lamport: change.lamport,
            wallTimeMs: change.wallTimeMs,
            schemaVersion: change.schemaVersion,
            contextJson: encodeCanonicalJson(change.context),
            opsJson: encodeCanonicalJson(
              change.ops.map((op) => op.toJson()).toList(),
            ),
            envelopeJson: prepared.envelopeJson,
            contentHash: prepared.contentHash,
            outboxState: Value(outboxState),
            serverCursor: Value(serverCursor),
            createdAt: createdAt,
            acceptedAt: Value(acceptedAt),
          ),
        );
  }

  Future<List<CrdtConflictSummary>> _mergeAllOps(
    ChangeEnvelope change, {
    required int cursor,
    required int now,
  }) async {
    final result = <CrdtConflictSummary>[];
    final candidates = change.candidates.toList(growable: false);
    for (var index = 0; index < change.ops.length; index++) {
      final op = change.ops[index];
      final conflict = await _mergeOp(
        op,
        candidates[index],
        epoch: change.epoch,
        cursor: cursor,
        now: now,
      );
      if (conflict != null) result.add(conflict);
    }
    return result;
  }

  Future<CrdtConflictSummary?> _mergeOp(
    AssignOp op,
    Candidate candidate, {
    required String epoch,
    required int cursor,
    required int now,
  }) async {
    final policy = crdtRegisterPolicy(op.resource, op.field);
    final existing =
        await (_db.select(_db.syncRegisters)..where(
              (row) =>
                  row.epoch.equals(epoch) &
                  row.resource.equals(op.resource) &
                  row.entityId.equals(op.entityId) &
                  row.field.equals(op.field),
            ))
            .getSingleOrNull();
    if (existing != null && existing.policy != policy.storageName) {
      throw CrdtProjectionException(
        'register policy mismatch for '
        '${op.resource}/${op.entityId}/${op.field}',
      );
    }
    var register = existing == null
        ? RegisterState()
        : RegisterState.fromJson(
            Map<String, Object?>.from(
              jsonDecode(existing.candidatesJson) as Map,
            ),
            resource: op.resource,
            entityId: op.entityId,
            field: op.field,
          );
    register = register.add(candidate);
    final visibleValue = switch (policy) {
      CrdtRegisterPolicy.removeWins => removeWinsExistence(register),
      CrdtRegisterPolicy.addWins => addWinsMembership(register),
      CrdtRegisterPolicy.multiValue => register.visibleWinner!.value,
    };
    await _db
        .into(_db.syncRegisters)
        .insertOnConflictUpdate(
          SyncRegistersCompanion.insert(
            epoch: epoch,
            resource: op.resource,
            entityId: op.entityId,
            field: op.field,
            policy: policy.storageName,
            candidatesJson: register.canonicalJson(),
            visibleValueJson: Value(encodeCanonicalJson(visibleValue)),
            updatedCursor: cursor,
            updatedAt: now,
          ),
        );
    if (!register.hasConflict) return null;
    return CrdtConflictSummary(
      resource: op.resource,
      entityId: op.entityId,
      field: op.field,
      candidateCount: register.candidates.length,
      winner: register.visibleWinner!,
    );
  }

  Future<int> _expectedLamport(String epoch, Map<String, int> context) async {
    var maximum = 0;
    for (final dependency in context.entries) {
      final change =
          await (_db.select(_db.syncChanges)..where(
                (row) =>
                    row.epoch.equals(epoch) &
                    row.actorId.equals(dependency.key) &
                    row.sequence.equals(dependency.value),
              ))
              .getSingleOrNull();
      if (change == null) {
        throw CrdtRetryableGap(
          'missing causal event ${dependency.key}:${dependency.value}',
        );
      }
      final inheritedRaw = jsonDecode(change.contextJson);
      if (inheritedRaw is! Map) {
        throw CrdtStoreException(
          'stored causal event ${dependency.key}:${dependency.value} has '
          'invalid context',
        );
      }
      for (final inherited in inheritedRaw.entries) {
        if (inherited.key is! String || inherited.value is! int) {
          throw CrdtStoreException(
            'stored causal event ${dependency.key}:${dependency.value} has '
            'invalid context',
          );
        }
        final inheritedActor = inherited.key as String;
        final inheritedSequence = inherited.value as int;
        if ((context[inheritedActor] ?? 0) < inheritedSequence) {
          throw _PermanentRemoteException(
            'invalid_context',
            'context is not transitively closed: '
                '${dependency.key}:${dependency.value} requires '
                '$inheritedActor:$inheritedSequence',
          );
        }
      }
      if (change.lamport > maximum) maximum = change.lamport;
    }
    if (maximum >= crdtMaxSafeInteger) {
      throw const _PermanentRemoteException(
        'lamport_overflow',
        'causal Lamport clock cannot be incremented safely',
      );
    }
    return maximum + 1;
  }

  Future<void> _upsertFrontier({
    required String epoch,
    required String actorId,
    required int sequence,
    required int cursor,
    required int now,
  }) => _db
      .into(_db.syncFrontiers)
      .insertOnConflictUpdate(
        SyncFrontiersCompanion.insert(
          epoch: epoch,
          actorId: actorId,
          contiguousSequence: Value(sequence),
          integratedCursor: Value(cursor),
          updatedAt: now,
        ),
      );

  Future<void> _quarantine(
    RemoteCrdtChange remote, {
    required String source,
    required String code,
    required String reason,
    required int receivedAt,
  }) async {
    final raw = remote.envelope;
    Map<Object?, Object?>? map;
    if (raw is Map) map = raw;
    String? envelopeJson;
    Uint8List? bytes = remote.originalBytes;
    try {
      if (raw is String) {
        envelopeJson = raw;
        bytes ??= Uint8List.fromList(utf8.encode(raw));
        final decoded = jsonDecode(raw);
        if (decoded is Map) map = decoded;
      } else if (raw is Uint8List) {
        bytes ??= raw;
        envelopeJson = utf8.decode(raw, allowMalformed: true);
        final decoded = jsonDecode(envelopeJson);
        if (decoded is Map) map = decoded;
      } else if (raw is ChangeEnvelope) {
        envelopeJson = raw.canonicalJson();
        map = raw.toJson();
      } else if (raw != null) {
        envelopeJson = jsonEncode(raw);
      }
    } on Object {
      // Quarantine must succeed even when the original payload cannot encode.
    }
    bytes ??= envelopeJson == null
        ? null
        : Uint8List.fromList(utf8.encode(envelopeJson));
    final contentHash = bytes == null ? null : sha256.convert(bytes).toString();
    final epoch = map?['epoch'];
    final changeId = map?['changeId'];
    final actorId = map?['actorId'];
    final sequence = map?['sequence'];
    await _db
        .into(_db.syncQuarantine)
        .insert(
          SyncQuarantineCompanion.insert(
            epoch: Value(epoch is String ? epoch : null),
            changeId: Value(changeId is String ? changeId : null),
            actorId: Value(actorId is String ? actorId : null),
            sequence: Value(sequence is int ? sequence : null),
            source: source,
            reasonCode: code,
            reason: reason,
            contentHash: Value(contentHash),
            envelopeJson: Value(envelopeJson),
            originalBytes: Value(bytes),
            receivedAt: receivedAt,
          ),
        );
  }

  Future<SyncReplicaStateRow?> _replicaState() => (_db.select(
    _db.syncReplicaState,
  )..where((row) => row.id.equals(1))).getSingleOrNull();

  Future<SyncReplicaStateRow> _requireReplica() async {
    final state = await _replicaState();
    if (state?.epoch == null) {
      throw const CrdtStoreException('CRDT replica is not bootstrapped');
    }
    return state!;
  }

  Future<SyncFrontierRow?> _frontier(String epoch, String actorId) =>
      (_db.select(_db.syncFrontiers)..where(
            (row) => row.epoch.equals(epoch) & row.actorId.equals(actorId),
          ))
          .getSingleOrNull();

  Future<bool> _hasQuarantinedDependency({
    required String epoch,
    required String actorId,
    required int afterSequence,
    required int throughSequence,
  }) async {
    final quarantined =
        await (_db.select(_db.syncQuarantine)..where(
              (row) =>
                  row.epoch.equals(epoch) &
                  row.actorId.equals(actorId) &
                  row.resolvedAt.isNull(),
            ))
            .get();
    return quarantined.any(
      (row) =>
          row.sequence != null &&
          row.sequence! > afterSequence &&
          row.sequence! <= throughSequence,
    );
  }

  int _validNow() {
    final value = _nowMs();
    _requireSafeNonNegative(value, 'current time');
    return value;
  }

  void _fault(String point) => _faultInjector?.call(point);
}

void _requireNonEmpty(String value, String name) {
  if (value.isEmpty) throw CrdtStoreException('$name must be non-empty');
}

void _requireSafeNonNegative(int value, String name) {
  if (value < 0 || value > crdtMaxSafeInteger) {
    throw CrdtStoreException('$name must be a non-negative safe integer');
  }
}
