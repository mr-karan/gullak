import 'package:dio/dio.dart';
import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/logger.dart';
import '../core/network_errors.dart';
import '../core/prefs.dart';
import '../core/secure_store.dart';
import '../data/db/database.dart';
import '../state/providers.dart';
import 'crdt_store.dart';
import 'sync_v2_client.dart';

typedef SyncRunResult = ({
  int pushed,
  int pulled,
  int quarantined,
  int duplicates,
  int conflicts,
  int protocol,
  String? error,
});

/// Reconciles the local causal log with one protocol-v2 Gullak server.
class SyncService {
  SyncService(
    this._db,
    this._secure,
    this._prefs, {
    Dio? dio,
    SyncV2Client? v2Client,
  }) : _dio = dio ?? Dio() {
    _v2 = v2Client ?? SyncV2Client(_db, _secure, CrdtStore(_db), dio: _dio);
  }

  final AppDatabase _db;
  final SecureStore _secure;
  final Prefs _prefs;
  final Dio _dio;
  late final SyncV2Client _v2;
  Future<SyncRunResult>? _inFlight;

  Future<bool> isConfigured() async {
    final url = (await _secure.readSyncBaseUrl())?.trim();
    return url != null && url.isNotEmpty;
  }

  Future<({bool ok, String message})> testConnection({
    required String baseUrl,
    String? apiKey,
  }) async {
    try {
      await _capabilities(baseUrl, apiKey);
      return (ok: true, message: 'OK · causal sync protocol v2');
    } on DioException catch (e) {
      return (ok: false, message: networkErrorMessage(e));
    } catch (e) {
      return (ok: false, message: networkErrorMessage(e));
    }
  }

  Future<({bool ok, String message})> probeHealth() async {
    final baseUrl = (await _secure.readSyncBaseUrl())?.trim();
    if (baseUrl == null || baseUrl.isEmpty) {
      return (ok: false, message: 'Sync server not configured.');
    }
    final apiKey = (await _secure.readSyncApiKey())?.trim();
    return testConnection(baseUrl: baseUrl, apiKey: apiKey);
  }

  Future<SyncRunResult> syncOnce() {
    final running = _inFlight;
    if (running != null) return running;
    late final Future<SyncRunResult> run;
    run = _syncOnce().whenComplete(() {
      if (identical(_inFlight, run)) _inFlight = null;
    });
    _inFlight = run;
    return run;
  }

  Future<SyncRunResult> _syncOnce() async {
    if (!await isConfigured()) {
      return (
        pushed: 0,
        pulled: 0,
        quarantined: 0,
        duplicates: 0,
        conflicts: 0,
        protocol: 0,
        error: 'Sync server not configured.',
      );
    }
    try {
      final baseUrl = (await _secure.readSyncBaseUrl())!.trim();
      final apiKey = (await _secure.readSyncApiKey())?.trim();
      final epoch = await _capabilities(baseUrl, apiKey);
      final result = await _v2.sync(
        baseUrl: baseUrl,
        epoch: epoch,
        apiKey: apiKey,
      );

      try {
        await pullWhatsappCandidates();
      } catch (e) {
        log.w('whatsapp candidate import failed: $e');
      }
      await _prefs.setSyncLastAt(DateTime.now().millisecondsSinceEpoch);
      if (result.quarantined > 0) {
        log.e('sync: quarantined ${result.quarantined} invalid change(s)');
        await _prefs.setSyncQuarantined(
          _prefs.syncQuarantined + result.quarantined,
        );
      }
      return (
        pushed: result.pushed,
        pulled: result.pulled,
        quarantined: result.quarantined,
        duplicates: result.duplicates,
        conflicts: result.conflicts,
        protocol: 2,
        error: null,
      );
    } catch (e) {
      log.w('sync failed: $e');
      return (
        pushed: 0,
        pulled: 0,
        quarantined: 0,
        duplicates: 0,
        conflicts: 0,
        protocol: 2,
        error: networkErrorMessage(e),
      );
    }
  }

  Future<String> _capabilities(String baseUrl, String? apiKey) async {
    final response = await _dio.get<Object?>(
      _join(baseUrl, '/v1/sync/v2/capabilities'),
      options: Options(
        headers: {
          if (apiKey != null && apiKey.isNotEmpty) 'x-api-key': apiKey,
          'accept': 'application/json',
          'connection': 'close',
        },
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 10),
      ),
    );
    final data = response.data;
    if (data is! Map || data['preferredProtocol'] != 2) {
      throw const SyncV2Exception(
        'Server does not support Gullak causal sync protocol v2.',
        code: 'unsupported_protocol',
      );
    }
    final v2 = data['v2'];
    if (v2 is! Map ||
        v2['epoch'] is! String ||
        (v2['epoch'] as String).isEmpty) {
      throw const SyncV2Exception(
        'Server has no active, verified sync epoch.',
        code: 'missing_epoch',
      );
    }
    return v2['epoch'] as String;
  }

  /// Imports pending WhatsApp/SMS Shortcut drafts into the local Inbox and
  /// acknowledges them idempotently on the server.
  Future<int> pullWhatsappCandidates() async {
    final baseUrl = (await _secure.readSyncBaseUrl())?.trim();
    final apiKey = (await _secure.readSyncApiKey())?.trim();
    if (baseUrl == null || baseUrl.isEmpty) return 0;
    final r = await _dio.get<dynamic>(
      _join(baseUrl, '/v1/whatsapp/inbox-candidates'),
      queryParameters: {'limit': 100},
      options: Options(
        headers: {
          if (apiKey != null && apiKey.isNotEmpty) 'x-api-key': apiKey,
          'accept': 'application/json',
          'connection': 'close',
        },
        connectTimeout: const Duration(seconds: 5),
        receiveTimeout: const Duration(seconds: 15),
      ),
    );
    final data = r.data;
    if (data is! Map) return 0;
    final items = data['items'];
    if (items is! List || items.isEmpty) return 0;

    final ackIds = <String>[];
    for (final raw in items) {
      if (raw is! Map<String, dynamic>) continue;
      final id = raw['id'] as String?;
      if (id == null || id.isEmpty) continue;
      final source = (raw['source'] as String?)?.trim().isNotEmpty == true
          ? (raw['source'] as String).trim()
          : 'whatsapp';
      final androidId = '$source:$id';
      final existing =
          await (_db.select(_db.smsMessages)
                ..where((t) => t.androidId.equals(androidId))
                ..limit(1))
              .get();
      if (existing.isNotEmpty) {
        ackIds.add(id);
        continue;
      }

      final body = (raw['body'] as String?)?.trim() ?? '';
      if (body.isEmpty) {
        ackIds.add(id);
        continue;
      }
      final receivedAt =
          (raw['receivedAt'] as num?)?.toInt() ??
          DateTime.now().millisecondsSinceEpoch;
      final candidateJson = raw['candidateJson'] as String?;
      final pushName = (raw['pushName'] as String?)?.trim();
      final sourceUser = (raw['sourceUser'] as String?)?.trim();
      final label = source == 'sms' ? 'SMS' : 'WhatsApp';
      final who = (pushName != null && pushName.isNotEmpty)
          ? pushName
          : (sourceUser != null && sourceUser.isNotEmpty)
          ? sourceUser
          : null;
      final address = who != null ? '$label · $who' : label;

      await _db
          .into(_db.smsMessages)
          .insert(
            SmsMessagesCompanion.insert(
              androidId: Value(androidId),
              address: address,
              body: body,
              receivedAt: receivedAt,
              classifiedAs: const Value('transactional'),
              parserVersion: const Value(1),
              candidateJson: Value(candidateJson),
              candidateStatus: const Value('inbox'),
            ),
          );
      ackIds.add(id);
    }

    if (ackIds.isNotEmpty) {
      try {
        await _dio.post<dynamic>(
          _join(baseUrl, '/v1/whatsapp/inbox-candidates/ack'),
          data: {'ids': ackIds},
          options: Options(
            headers: {
              if (apiKey != null && apiKey.isNotEmpty) 'x-api-key': apiKey,
              'content-type': 'application/json',
              'accept': 'application/json',
              'connection': 'close',
            },
            connectTimeout: const Duration(seconds: 5),
            receiveTimeout: const Duration(seconds: 10),
          ),
        );
      } catch (e) {
        log.w('whatsapp candidate ack failed: $e');
      }
    }
    return ackIds.length;
  }

  static String _join(String baseUrl, String path) {
    final base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    return path.startsWith('/') ? '$base$path' : '$base/$path';
  }
}

final Provider<SyncService> syncServiceProvider = Provider<SyncService>((ref) {
  return SyncService(
    ref.read(dbProvider),
    ref.read(secureStoreProvider),
    ref.read(prefsProvider),
  );
});
