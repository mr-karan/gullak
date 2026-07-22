import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../data/db/database.dart';
import '../state/providers.dart';
import 'crdt.dart';
import 'crdt_resources.dart';
import 'crdt_store.dart';
import 'sync_scheduler.dart';

final class _PendingMutation {
  const _PendingMutation.upsert(
    this.resource,
    this.id,
    this.payload,
    this.changedFields,
  ) : deleted = false;

  const _PendingMutation.delete(this.resource, this.id)
    : deleted = true,
      payload = null,
      changedFields = null;

  final String resource;
  final String id;
  final bool deleted;
  final Map<String, dynamic>? payload;
  final Set<String>? changedFields;
}

final class _CommandCollector {
  final Map<String, _PendingMutation> mutations = {};

  void put(_PendingMutation mutation) {
    final key = '${mutation.resource}\u0000${mutation.id}';
    final previous = mutations[key];
    if (!mutation.deleted && previous != null && !previous.deleted) {
      final previousFields = previous.changedFields;
      final nextFields = mutation.changedFields;
      mutations[key] = _PendingMutation.upsert(
        mutation.resource,
        mutation.id,
        mutation.payload,
        previousFields == null || nextFields == null
            ? null
            : {...previousFields, ...nextFields},
      );
      return;
    }
    mutations[key] = mutation;
  }
}

/// Durable outbox boundary for one local domain command.
///
/// Repositories must execute mutations with [command]. Before a replica has a
/// v2 epoch, the command atomically writes the legacy v1 snapshot outbox. Once
/// bootstrapped, it instead authors one causal v2 event containing only fields
/// whose visible register value changed. Domain rows and their outbox fact
/// therefore commit or roll back together.
class ChangeLogWriter {
  ChangeLogWriter(this._db, {SyncScheduler? scheduler, CrdtStore? crdtStore})
    : _scheduler = scheduler,
      _crdtStore = crdtStore ?? CrdtStore(_db);

  final AppDatabase _db;
  final SyncScheduler? _scheduler;
  final CrdtStore _crdtStore;
  static const _uuid = Uuid();
  final _collectorKey = Object();

  /// Runs one user/domain action in one database transaction and emits exactly
  /// one v2 envelope (or its v1 compatibility rows). Nested commands join the
  /// outer command, which makes helpers safe to compose.
  Future<T> command<T>(Future<T> Function() callback) async {
    final existing = Zone.current[_collectorKey] as _CommandCollector?;
    if (existing != null) return callback();

    final collector = _CommandCollector();
    final result = await _db.transaction(
      () => runZoned(() async {
        final value = await callback();
        await _flush(collector);
        return value;
      }, zoneValues: {_collectorKey: collector}),
    );
    if (collector.mutations.isNotEmpty) _scheduler?.schedule();
    return result;
  }

  /// Records the final row projection for the current command. In v2 this is
  /// diffed against visible registers; it is never blindly sent as a snapshot.
  Future<void> upsert(
    String resource,
    String id,
    Map<String, dynamic> payload, {
    Set<String>? changedFields,
  }) async {
    _requireSyncedResource(resource);
    final collector = _requireCollector();
    collector.put(
      _PendingMutation.upsert(
        resource,
        id,
        Map<String, dynamic>.from(payload),
        changedFields == null ? null : Set<String>.from(changedFields),
      ),
    );
  }

  Future<void> delete(String resource, String id) async {
    _requireSyncedResource(resource);
    _requireCollector().put(_PendingMutation.delete(resource, id));
  }

  _CommandCollector _requireCollector() {
    final collector = Zone.current[_collectorKey] as _CommandCollector?;
    if (collector == null) {
      throw StateError(
        'sync mutations must be recorded inside ChangeLogWriter.command',
      );
    }
    return collector;
  }

  void _requireSyncedResource(String resource) {
    if (!syncedCrdtResources.contains(resource)) {
      throw ArgumentError.value(resource, 'resource', 'is not synced');
    }
  }

  Future<void> _flush(_CommandCollector collector) async {
    if (collector.mutations.isEmpty) return;
    final state = await (_db.select(
      _db.syncReplicaState,
    )..where((row) => row.id.equals(1))).getSingleOrNull();
    final epoch = state?.epoch;
    if (epoch == null) {
      await _flushLegacy(collector.mutations.values);
      return;
    }

    final ops = <AssignOp>[];
    for (final mutation in collector.mutations.values) {
      ops.addAll(await _diffMutation(epoch, mutation));
    }
    if (ops.isNotEmpty) await _crdtStore.authorLocalChange(ops: ops);
  }

  Future<void> _flushLegacy(Iterable<_PendingMutation> mutations) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    for (final mutation in mutations) {
      await _db
          .into(_db.changeLog)
          .insert(
            ChangeLogCompanion.insert(
              at: now,
              clientChangeId: Value(_uuid.v4()),
              resource: mutation.resource,
              resourceId: mutation.id,
              op: mutation.deleted ? 'delete' : 'upsert',
              payload: Value(
                jsonEncode(
                  mutation.deleted ? {'updatedAt': now} : mutation.payload,
                ),
              ),
            ),
          );
    }
  }

  Future<List<AssignOp>> _diffMutation(
    String epoch,
    _PendingMutation mutation,
  ) async {
    final rows =
        await (_db.select(_db.syncRegisters)..where(
              (row) =>
                  row.epoch.equals(epoch) &
                  row.resource.equals(mutation.resource) &
                  row.entityId.equals(mutation.id),
            ))
            .get();
    final visible = <String, Object?>{
      for (final row in rows)
        if (row.visibleValueJson != null)
          row.field: jsonDecode(row.visibleValueJson!),
    };
    final lifecycle = crdtLifecycleField(mutation.resource);
    if (mutation.deleted) {
      if (visible[lifecycle] == false) return const [];
      return [
        AssignOp(
          resource: mutation.resource,
          entityId: mutation.id,
          field: lifecycle,
          value: false,
        ),
      ];
    }

    final result = <AssignOp>[];
    final isCreate = visible[lifecycle] != true;
    final isFirstCreate = !visible.containsKey(lifecycle);
    if (isCreate) {
      result.add(
        AssignOp(
          resource: mutation.resource,
          entityId: mutation.id,
          field: lifecycle,
          value: true,
        ),
      );
    }
    final payload = mutation.payload!;
    final allowedFields = crdtPayloadFields(mutation.resource);
    final fields = isFirstCreate || mutation.changedFields == null
        ? allowedFields
        : mutation.changedFields!;
    for (final field in fields) {
      if (!allowedFields.contains(field)) {
        throw ArgumentError.value(
          field,
          'changedFields',
          'is not replicated for ${mutation.resource}',
        );
      }
      if (!payload.containsKey(field)) continue;
      if (mutation.resource == 'transactions' &&
          field == 'amountCents' &&
          (payload['origin'] == 'split' || payload['isGroupParent'] == true)) {
        continue;
      }
      if ((mutation.resource == 'transactions' ||
              mutation.resource == 'recurrences') &&
          field == 'payeeName' &&
          payload['payeeId'] != null) {
        continue;
      }
      final value = _normalizeField(mutation.resource, field, payload[field]);
      if (!isCreate && _jsonEqual(visible[field], value)) continue;
      result.add(
        AssignOp(
          resource: mutation.resource,
          entityId: mutation.id,
          field: field,
          value: value,
        ),
      );
    }
    if ((mutation.resource == 'transactions' ||
            mutation.resource == 'recurrences') &&
        result.any((op) => op.field == 'payeeId' && op.value == null) &&
        !result.any((op) => op.field == 'payeeName')) {
      result.add(
        AssignOp(
          resource: mutation.resource,
          entityId: mutation.id,
          field: 'payeeName',
          value: payload['payeeName'],
        ),
      );
    }
    return result;
  }

  Object? _normalizeField(String resource, String field, Object? value) {
    if (resource == 'transactions' &&
        (field == 'latitude' || field == 'longitude') &&
        value != null) {
      return quantizeSyncCoordinate((value as num).toDouble());
    }
    return value;
  }

  bool _jsonEqual(Object? left, Object? right) =>
      jsonEncode(left) == jsonEncode(right);
}

/// Coordinates are deterministic protocol values, not platform-dependent
/// floating point noise. Seven decimals is ~1.1 cm at the equator.
double quantizeSyncCoordinate(double value) {
  if (!value.isFinite) {
    throw ArgumentError.value(value, 'coordinate', 'must be finite');
  }
  final quantized = (value * 10000000).round() / 10000000;
  return quantized == 0 ? 0 : quantized;
}

final Provider<ChangeLogWriter> changeLogWriterProvider =
    Provider<ChangeLogWriter>(
      (ref) => ChangeLogWriter(
        ref.read(dbProvider),
        scheduler: ref.read(syncSchedulerProvider),
      ),
    );
