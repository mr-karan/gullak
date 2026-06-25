import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../data/db/database.dart';
import '../state/providers.dart';
import 'sync_scheduler.dart';

/// Append-only writer for the local sync change log. Every repository
/// mutation (insert, update, delete) calls one of these so the
/// SyncService can push deltas to the homelab.
///
/// Each entry gets a UUID `clientChangeId` that the server uses (with
/// our installation's `clientId`) as a per-row idempotency key, so a
/// retried push after a transient failure doesn't duplicate.
class ChangeLogWriter {
  ChangeLogWriter(this._db, {SyncScheduler? scheduler})
    : _scheduler = scheduler;
  final AppDatabase _db;
  final SyncScheduler? _scheduler;
  static const _uuid = Uuid();

  Future<void> upsert(
    String resource,
    String id,
    Map<String, dynamic> payload,
  ) async {
    await _db
        .into(_db.changeLog)
        .insert(
          ChangeLogCompanion.insert(
            at: DateTime.now().millisecondsSinceEpoch,
            clientChangeId: Value(_uuid.v4()),
            resource: resource,
            resourceId: id,
            op: 'upsert',
            payload: Value(jsonEncode(payload)),
          ),
        );
    _scheduler?.schedule();
  }

  Future<void> delete(String resource, String id) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    await _db
        .into(_db.changeLog)
        .insert(
          ChangeLogCompanion.insert(
            at: now,
            clientChangeId: Value(_uuid.v4()),
            resource: resource,
            resourceId: id,
            op: 'delete',
            // Tombstone time so the server applies last-write-wins on deletes —
            // a stale delete arriving after a newer edit won't clobber it.
            payload: Value(jsonEncode({'updatedAt': now})),
          ),
        );
    _scheduler?.schedule();
  }
}

final Provider<ChangeLogWriter> changeLogWriterProvider =
    Provider<ChangeLogWriter>(
      (ref) => ChangeLogWriter(
        ref.read(dbProvider),
        scheduler: ref.read(syncSchedulerProvider),
      ),
    );
