import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/db/database.dart';
import '../state/providers.dart';

/// Append-only writer for the local sync change log. Every repository
/// mutation (insert, update, delete) calls one of these so the
/// SyncService can push deltas to the homelab.
class ChangeLogWriter {
  ChangeLogWriter(this._db);
  final AppDatabase _db;

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
            resource: resource,
            resourceId: id,
            op: 'upsert',
            payload: Value(jsonEncode(payload)),
          ),
        );
  }

  Future<void> delete(String resource, String id) async {
    await _db
        .into(_db.changeLog)
        .insert(
          ChangeLogCompanion.insert(
            at: DateTime.now().millisecondsSinceEpoch,
            resource: resource,
            resourceId: id,
            op: 'delete',
          ),
        );
  }
}

final Provider<ChangeLogWriter> changeLogWriterProvider =
    Provider<ChangeLogWriter>((ref) => ChangeLogWriter(ref.read(dbProvider)));
