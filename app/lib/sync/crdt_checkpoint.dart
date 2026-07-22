import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart';

import '../data/db/database.dart';
import 'crdt.dart';
import 'crdt_resources.dart';
import 'crdt_store.dart';

/// A verified, self-contained server checkpoint plus its immutable event
/// prefix. Checkpoint installation is the only supported way to move a local
/// replica onto an epoch at a non-zero transport cursor.
final class CrdtBootstrapBundle {
  const CrdtBootstrapBundle({
    required this.epoch,
    required this.checkpoint,
    required this.changes,
  });

  factory CrdtBootstrapBundle.fromJson(Object? raw) {
    if (raw is! Map) {
      throw const CrdtStoreException('bootstrap response must be an object');
    }
    final json = Map<String, Object?>.from(raw);
    if (json['protocol'] != 2) {
      throw const CrdtStoreException('bootstrap protocol must be 2');
    }
    final epoch = _requiredString(json, 'epoch');
    final checkpointRaw = json['checkpoint'];
    if (checkpointRaw is! Map) {
      throw const CrdtStoreException('bootstrap checkpoint must be an object');
    }
    final changesRaw = json['changesThroughCheckpoint'];
    if (changesRaw is! List) {
      throw const CrdtStoreException(
        'bootstrap must include changesThroughCheckpoint',
      );
    }
    return CrdtBootstrapBundle(
      epoch: epoch,
      checkpoint: CrdtWireCheckpoint.fromJson(
        Map<String, Object?>.from(checkpointRaw),
        epoch: epoch,
      ),
      changes: changesRaw
          .map((value) => CrdtCheckpointChange.fromJson(value, epoch: epoch))
          .toList(growable: false),
    );
  }

  final String epoch;
  final CrdtWireCheckpoint checkpoint;
  final List<CrdtCheckpointChange> changes;
}

final class CrdtWireCheckpoint {
  const CrdtWireCheckpoint({
    required this.id,
    required this.epoch,
    required this.schemaVersion,
    required this.frontier,
    required this.registers,
    required this.projectionHash,
    required this.contentHash,
    required this.cursor,
    required this.eventCount,
    required this.isGenesis,
    required this.createdAt,
  });

  factory CrdtWireCheckpoint.fromJson(
    Map<String, Object?> json, {
    required String epoch,
  }) {
    final checkpointEpoch = json['epoch'] == null
        ? epoch
        : _requiredString(json, 'epoch');
    if (checkpointEpoch != epoch) {
      throw const CrdtStoreException('checkpoint epoch mismatch');
    }
    final frontierRaw = json['frontier'];
    if (frontierRaw is! Map) {
      throw const CrdtStoreException('checkpoint frontier must be an object');
    }
    final frontier = <String, int>{};
    for (final entry in frontierRaw.entries) {
      if (entry.key is! String ||
          entry.key.toString().isEmpty ||
          entry.value is! int ||
          (entry.value as int) < 1 ||
          (entry.value as int) > crdtMaxSafeInteger) {
        throw const CrdtStoreException('checkpoint frontier is invalid');
      }
      frontier[entry.key as String] = entry.value as int;
    }
    final registers = json['registers'];
    if (registers is! List) {
      throw const CrdtStoreException('checkpoint registers must be an array');
    }
    final result = CrdtWireCheckpoint(
      id: _requiredString(json, 'id'),
      epoch: checkpointEpoch,
      schemaVersion: _requiredSafeInt(json, 'schemaVersion', minimum: 1),
      frontier: Map.unmodifiable(frontier),
      registers: List.unmodifiable(registers),
      projectionHash: _requiredSha256(json, 'projectionHash'),
      contentHash: _requiredSha256(json, 'contentHash'),
      cursor: _requiredSafeInt(json, 'cursor', minimum: 0),
      eventCount: _requiredSafeInt(json, 'eventCount', minimum: 0),
      isGenesis: _requiredBool(json, 'isGenesis'),
      createdAt: _requiredSafeInt(json, 'createdAt', minimum: 0),
    );
    if (result.schemaVersion != 1) {
      throw CrdtStoreException(
        'unsupported checkpoint schemaVersion ${result.schemaVersion}',
      );
    }
    result.verifyContentHash();
    return result;
  }

  final String id;
  final String epoch;
  final int schemaVersion;
  final Map<String, int> frontier;
  final List<Object?> registers;
  final String projectionHash;
  final String contentHash;
  final int cursor;
  final int eventCount;
  final bool isGenesis;
  final int createdAt;

  void verifyContentHash() {
    final canonical = encodeCanonicalJson({
      'epoch': epoch,
      'schemaVersion': schemaVersion,
      'frontier': frontier,
      'registers': registers,
      'projectionHash': projectionHash,
      'creationCursor': cursor,
      'eventCount': eventCount,
      'isGenesis': isGenesis,
    });
    final actual = sha256.convert(utf8.encode(canonical)).toString();
    if (actual != contentHash) {
      throw const CrdtStoreException('checkpoint content hash mismatch');
    }
  }
}

final class CrdtCheckpointChange {
  const CrdtCheckpointChange({
    required this.cursor,
    required this.contentHash,
    required this.envelope,
  });

  factory CrdtCheckpointChange.fromJson(Object? raw, {required String epoch}) {
    if (raw is! Map) {
      throw const CrdtStoreException('checkpoint change must be an object');
    }
    final json = Map<String, Object?>.from(raw);
    final envelopeRaw = json['envelope'];
    if (envelopeRaw is! Map) {
      throw const CrdtStoreException(
        'checkpoint change envelope must be an object',
      );
    }
    final envelope = ChangeEnvelope.fromJson(
      Map<String, Object?>.from(envelopeRaw),
    );
    if (envelope.epoch != epoch) {
      throw const CrdtStoreException('checkpoint change epoch mismatch');
    }
    final expectedHash = _requiredSha256(json, 'contentHash');
    final actualHash = sha256
        .convert(utf8.encode(envelope.canonicalJson()))
        .toString();
    if (actualHash != expectedHash) {
      throw const CrdtStoreException('checkpoint change hash mismatch');
    }
    return CrdtCheckpointChange(
      cursor: _requiredSafeInt(json, 'cursor', minimum: 1),
      contentHash: expectedHash,
      envelope: envelope,
    );
  }

  final int cursor;
  final String contentHash;
  final ChangeEnvelope envelope;
}

/// Installs a checkpoint and its complete immutable prefix in one Drift
/// transaction. Domain rows are only replaced after the bundle has passed all
/// transport-level checks, and any later projection mismatch rolls everything
/// back. Local-only tables (SMS inbox, rules, preferences) are untouched.
final class CrdtCheckpointInstaller {
  CrdtCheckpointInstaller(this._db, this._store);

  final AppDatabase _db;
  final CrdtStore _store;

  Future<SyncReplicaStateRow> install(
    CrdtBootstrapBundle bundle, {
    String? actorId,
  }) async {
    _verifyBundleShape(bundle);
    return _db.transaction(() async {
      final legacyPending = await (_db.select(
        _db.changeLog,
      )..where((row) => row.synced.equals(false))).get();
      if (legacyPending.isNotEmpty) {
        throw const CrdtStoreException(
          'cannot bootstrap while legacy changes are pending',
        );
      }
      final v2Unresolved =
          await (_db.select(_db.syncChanges)..where(
                (row) =>
                    row.outboxState.equals('pending') |
                    row.outboxState.equals('rejected'),
              ))
              .get();
      if (v2Unresolved.isNotEmpty) {
        throw const CrdtStoreException(
          'cannot replace a replica with unresolved CRDT changes',
        );
      }
      final existingState = await (_db.select(
        _db.syncReplicaState,
      )..where((row) => row.id.equals(1))).getSingleOrNull();
      final durableActor = actorId ?? existingState?.actorId;
      if (actorId != null &&
          existingState != null &&
          actorId != existingState.actorId) {
        final unresolved =
            await (_db.select(_db.syncChanges)..where(
                  (row) =>
                      row.actorId.equals(existingState.actorId) &
                      (row.outboxState.equals('pending') |
                          row.outboxState.equals('rejected')),
                ))
                .get();
        if (unresolved.isNotEmpty) {
          throw const CrdtStoreException(
            'checkpoint install cannot replace an actor with unresolved changes',
          );
        }
      }

      await _clearSyncedProjection();
      await _store.bootstrapEmptyReplica(
        epoch: bundle.epoch,
        actorId: durableActor,
      );
      if (bundle.changes.isNotEmpty) {
        final integrated = await _store.integrateRemotePage(
          changes: bundle.changes
              .map(
                (change) => RemoteCrdtChange(
                  envelope: change.envelope,
                  serverCursor: change.cursor,
                ),
              )
              .toList(growable: false),
          nextCursor: bundle.checkpoint.cursor,
          source: 'checkpoint:${bundle.checkpoint.id}',
        );
        if (integrated.quarantined != 0 ||
            integrated.accepted != bundle.changes.length) {
          throw const CrdtStoreException(
            'checkpoint prefix did not integrate completely',
          );
        }
      }

      await _verifyInstalledState(bundle);
      final now = DateTime.now().millisecondsSinceEpoch;
      await _db
          .into(_db.syncCheckpoints)
          .insert(
            SyncCheckpointsCompanion.insert(
              id: bundle.checkpoint.id,
              epoch: bundle.epoch,
              schemaVersion: bundle.checkpoint.schemaVersion,
              frontierJson: encodeCanonicalJson(bundle.checkpoint.frontier),
              registersJson: encodeCanonicalJson(bundle.checkpoint.registers),
              projectionHash: bundle.checkpoint.projectionHash,
              contentHash: bundle.checkpoint.contentHash,
              creationCursor: bundle.checkpoint.cursor,
              eventCount: bundle.checkpoint.eventCount,
              isGenesis: Value(bundle.checkpoint.isGenesis),
              createdAt: bundle.checkpoint.createdAt,
              verifiedAt: Value(now),
            ),
          );
      await (_db.update(
        _db.syncReplicaState,
      )..where((row) => row.id.equals(1))).write(
        SyncReplicaStateCompanion(
          checkpointId: Value(bundle.checkpoint.id),
          updatedAt: Value(now),
        ),
      );
      return (_db.select(
        _db.syncReplicaState,
      )..where((row) => row.id.equals(1))).getSingle();
    });
  }

  void _verifyBundleShape(CrdtBootstrapBundle bundle) {
    final checkpoint = bundle.checkpoint;
    checkpoint.verifyContentHash();
    if (checkpoint.epoch != bundle.epoch) {
      throw const CrdtStoreException('bootstrap epoch mismatch');
    }
    if (bundle.changes.length != checkpoint.eventCount) {
      throw const CrdtStoreException(
        'checkpoint eventCount does not match its immutable prefix',
      );
    }
    var previousCursor = 0;
    final frontier = <String, int>{};
    for (final change in bundle.changes) {
      if (change.cursor <= previousCursor ||
          change.cursor > checkpoint.cursor) {
        throw const CrdtStoreException(
          'checkpoint change cursors must be strictly increasing',
        );
      }
      previousCursor = change.cursor;
      frontier[change.envelope.actorId] = change.envelope.sequence;
    }
    if (bundle.changes.isEmpty) {
      if (checkpoint.cursor != 0 || checkpoint.frontier.isNotEmpty) {
        throw const CrdtStoreException(
          'an empty checkpoint must start at cursor zero',
        );
      }
    } else if (previousCursor != checkpoint.cursor) {
      throw const CrdtStoreException(
        'checkpoint prefix does not end at its creation cursor',
      );
    }
    if (encodeCanonicalJson(frontier) !=
        encodeCanonicalJson(checkpoint.frontier)) {
      throw const CrdtStoreException(
        'checkpoint frontier does not match its immutable prefix',
      );
    }
  }

  Future<void> _verifyInstalledState(CrdtBootstrapBundle bundle) async {
    final checkpoint = bundle.checkpoint;
    final state = await (_db.select(
      _db.syncReplicaState,
    )..where((row) => row.id.equals(1))).getSingle();
    if (state.epoch != bundle.epoch || state.pullCursor != checkpoint.cursor) {
      throw const CrdtStoreException(
        'installed replica cursor or epoch does not match checkpoint',
      );
    }
    final frontiers = await (_db.select(
      _db.syncFrontiers,
    )..where((row) => row.epoch.equals(bundle.epoch))).get();
    final installedFrontier = <String, int>{
      for (final row in frontiers) row.actorId: row.contiguousSequence,
    };
    if (encodeCanonicalJson(installedFrontier) !=
        encodeCanonicalJson(checkpoint.frontier)) {
      throw const CrdtStoreException('installed frontier mismatch');
    }
    final rows = await (_db.select(
      _db.syncRegisters,
    )..where((row) => row.epoch.equals(bundle.epoch))).get();
    final installed =
        rows
            .map(
              (row) => <String, Object?>{
                'resource': row.resource,
                'entityId': row.entityId,
                'field': row.field,
                'policy': row.policy,
                'candidates': jsonDecode(row.candidatesJson),
                'visibleValue': row.visibleValueJson == null
                    ? null
                    : jsonDecode(row.visibleValueJson!),
                'updatedCursor': row.updatedCursor,
              },
            )
            .toList()
          ..sort(_compareRegisterRows);
    final expected = checkpoint.registers.map((raw) {
      if (raw is! Map) {
        throw const CrdtStoreException('checkpoint register must be an object');
      }
      return Map<String, Object?>.from(raw);
    }).toList()..sort(_compareRegisterRows);
    if (encodeCanonicalJson(installed) != encodeCanonicalJson(expected)) {
      throw const CrdtStoreException('installed register state mismatch');
    }
    final projectionHash = await crdtProjectionHash(_db);
    if (projectionHash != checkpoint.projectionHash) {
      throw CrdtStoreException(
        'installed projection hash mismatch: expected '
        '${checkpoint.projectionHash}, got $projectionHash',
      );
    }
  }

  Future<void> _clearSyncedProjection() async {
    // Relation/dependent rows first. These deletes and the replacement fold
    // are enclosed by the caller's transaction and therefore never expose a
    // half-installed projection.
    for (final table in const [
      'transaction_tags',
      'budgets',
      'recurrences',
      'transactions',
      'categories',
      'category_groups',
      'payees',
      'tags',
      'accounts',
      'sync_quarantine',
      'sync_registers',
      'sync_frontiers',
      'sync_changes',
      'sync_checkpoints',
      'sync_replica_state',
    ]) {
      await _db.customStatement('DELETE FROM $table');
    }
  }
}

int _compareRegisterRows(
  Map<String, Object?> left,
  Map<String, Object?> right,
) {
  for (final field in const ['resource', 'entityId', 'field']) {
    final comparison = (left[field] as String).compareTo(
      right[field] as String,
    );
    if (comparison != 0) return comparison;
  }
  return 0;
}

String _requiredString(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! String || value.isEmpty) {
    throw CrdtStoreException('$key must be a non-empty string');
  }
  return value;
}

String _requiredSha256(Map<String, Object?> json, String key) {
  final value = _requiredString(json, key);
  if (!RegExp(r'^[a-f0-9]{64}$').hasMatch(value)) {
    throw CrdtStoreException('$key must be a lowercase SHA-256 digest');
  }
  return value;
}

int _requiredSafeInt(
  Map<String, Object?> json,
  String key, {
  required int minimum,
}) {
  final value = json[key];
  if (value is! int || value < minimum || value > crdtMaxSafeInteger) {
    throw CrdtStoreException('$key must be a safe integer >= $minimum');
  }
  return value;
}

bool _requiredBool(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! bool) throw CrdtStoreException('$key must be boolean');
  return value;
}
