import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network_errors.dart';
import '../../core/secure_store.dart';
import '../../state/providers.dart';

/// HTTP client over the user's homelab pi-server. The server holds the
/// real LLM credentials and runs the prompts; the phone just hands it
/// inputs and reads back JSON. If the user hasn't configured a sync
/// server, [PiAiClient.fromSecure] returns null and any caller must
/// surface that as "AI features need the sync server first".
///
/// The apiKey parameter is a fallback for tests and statically-
/// configured clients. In production, pass [store] instead — the key
/// is read fresh from SecureStore before every request, so changing
/// the sync server in Settings takes effect immediately without
/// needing a provider-level invalidation race to resolve first.
class PiAiClient {
  PiAiClient({required this.baseUrl, this.apiKey, SecureStore? store, Dio? dio})
    : _store = store,
      _dio = dio ?? Dio();

  final String baseUrl;

  /// Static fallback key (tests, legacy). Prefer [store] in production.
  final String? apiKey;

  final SecureStore? _store;
  final Dio _dio;

  static Future<PiAiClient?> fromSecure(SecureStore store) async {
    final base = (await store.readSyncBaseUrl())?.trim();
    if (base == null || base.isEmpty) return null;
    return PiAiClient(baseUrl: base, store: store);
  }

  /// Resolve the active API key. Reads from SecureStore when
  /// available so the key is always current — no stale caches.
  Future<String?> _resolveApiKey() async {
    if (_store != null) {
      final key = (await _store.readSyncApiKey())?.trim();
      if (key != null && key.isNotEmpty) return key;
    }
    final fallback = apiKey?.trim();
    if (fallback != null && fallback.isNotEmpty) return fallback;
    return null;
  }

  Future<Map<String, String>> _buildHeaders() async {
    final key = await _resolveApiKey();
    final headers = {
      'content-type': 'application/json',
      'accept': 'application/json',
      'connection': 'close',
    };
    if (key != null) headers['x-api-key'] = key;
    return headers;
  }

  String _url(String path) {
    final base = baseUrl.endsWith('/')
        ? baseUrl.substring(0, baseUrl.length - 1)
        : baseUrl;
    final p = path.startsWith('/') ? path : '/$path';
    return '$base$p';
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final r = await _dio.post<dynamic>(
      _url(path),
      data: jsonEncode(body),
      options: Options(
        headers: await _buildHeaders(),
        responseType: ResponseType.json,
        connectTimeout: const Duration(seconds: 5),
        sendTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
      ),
    );
    final data = r.data;
    if (data is Map<String, dynamic>) return data;
    if (data is String) return jsonDecode(data) as Map<String, dynamic>;
    throw PiAiException('unexpected response type: ${data.runtimeType}');
  }

  Future<SmsParseResponse> parseSms({
    required String sender,
    required String body,
    required DateTime receivedAt,
    List<NamedRow> categories = const [],
    List<PayeeCategoryRow> payees = const [],
  }) async {
    try {
      final json = await _post('/v1/ai/sms/parse', {
        'sender': sender,
        'body': body,
        'receivedAt': receivedAt.millisecondsSinceEpoch,
        'categories': categories.map((r) => r.toJson()).toList(),
        'payees': payees.map((r) => r.toJson()).toList(),
      });
      return SmsParseResponse.fromJson(json);
    } on DioException catch (e) {
      throw PiAiException('sms parse failed: ${networkErrorMessage(e)}');
    }
  }

  Future<QuickEntryResponse> parseQuickEntry({
    required String text,
    required String today,
    required int minorDigits,
    required List<NamedRow> accounts,
    required List<NamedRow> categories,
    required List<NamedRow> payees,
    Uint8List? imageBytes,
    String? imageMimeType,
  }) async {
    final body = <String, dynamic>{
      'text': text,
      'today': today,
      'minorDigits': minorDigits,
      'accounts': accounts.map((r) => r.toJson()).toList(),
      'categories': categories.map((r) => r.toJson()).toList(),
      'payees': payees.map((r) => r.toJson()).toList(),
    };
    if (imageBytes != null) {
      body['imageBase64'] = base64Encode(imageBytes);
      body['imageMimeType'] = imageMimeType ?? 'image/jpeg';
    }
    try {
      final json = await _post('/v1/ai/quick-entry/parse', body);
      return QuickEntryResponse.fromJson(json);
    } on DioException catch (e) {
      throw PiAiException(
        'quick-entry parse failed: ${networkErrorMessage(e)}',
      );
    }
  }

  /// Upload one or more confirmed SMS bodies to the pi-server. Idempotent
  /// on `id` — safe to retry, safe to re-upload an existing row to refresh
  /// its `linkedTransactionId` snapshot.
  ///
  /// Server uses these bodies for the LLM cleanup pass that fixes payee /
  /// category metadata after Confirm All. The body never leaves the user's
  /// own infrastructure — it goes to the homelab pi-server and stays there.
  Future<({int inserted, int updated, int total})> bulkIngestSms({
    required List<SmsIngestItem> items,
  }) async {
    if (items.isEmpty) return (inserted: 0, updated: 0, total: 0);
    try {
      final json = await _post('/v1/sms/bulk-ingest', {
        'items': items.map((i) => i.toJson()).toList(),
      });
      return (
        inserted: (json['inserted'] as num?)?.toInt() ?? 0,
        updated: (json['updated'] as num?)?.toInt() ?? 0,
        total: (json['total'] as num?)?.toInt() ?? items.length,
      );
    } on DioException catch (e) {
      throw PiAiException('sms ingest failed: ${networkErrorMessage(e)}');
    }
  }

  /// Trigger the server-side LLM cleanup pass. Idempotent — safe to call
  /// after every Confirm All; rows already enriched are skipped unless
  /// `force=true`. Server PATCHes the linked transactions and the change
  /// flows back to the phone via the normal sync pull.
  Future<({int processed, int enriched, int staleSkipped, int failed})>
  reprocessSms({
    int? limit,
    List<String>? smsIds,
    bool force = false,
    int? batchSize,
  }) async {
    try {
      final body = <String, dynamic>{
        if (limit != null) 'limit': limit,
        if (smsIds != null && smsIds.isNotEmpty) 'smsIds': smsIds,
        if (force) 'force': true,
        if (batchSize != null) 'batchSize': batchSize,
      };
      final json = await _post('/v1/sms/reprocess', body);
      return (
        processed: (json['processed'] as num?)?.toInt() ?? 0,
        enriched: (json['enriched'] as num?)?.toInt() ?? 0,
        staleSkipped: (json['staleSkipped'] as num?)?.toInt() ?? 0,
        failed: (json['failed'] as num?)?.toInt() ?? 0,
      );
    } on DioException catch (e) {
      throw PiAiException('sms reprocess failed: ${networkErrorMessage(e)}');
    }
  }

  Future<int?> sendFeedback({
    required String kind,
    String? message,
    String? clientId,
    required Map<String, dynamic> payload,
  }) async {
    try {
      final json = await _post('/v1/feedback', {
        'kind': kind,
        if (message != null && message.trim().isNotEmpty) 'message': message,
        if (clientId != null && clientId.trim().isNotEmpty)
          'clientId': clientId,
        'payload': payload,
      });
      return (json['id'] as num?)?.toInt();
    } on DioException catch (e) {
      throw PiAiException('feedback send failed: ${networkErrorMessage(e)}');
    }
  }
}

class NamedRow {
  const NamedRow(this.id, this.name);
  final String id;
  final String name;
  Map<String, dynamic> toJson() => {'id': id, 'name': name};
}

/// One row in a bulk SMS ingest call. `id` is a stable client identifier
/// — pass the Android SMS id when available so re-uploads idempotently
/// hit the same server-side row. `baseTransactionUpdatedAt` is the
/// `transactions.updated_at` snapshot at confirm time; the server uses
/// it as a fence so the reprocess pass doesn't clobber later user edits.
class SmsIngestItem {
  const SmsIngestItem({
    required this.id,
    required this.sender,
    required this.body,
    required this.receivedAt,
    this.linkedTransactionId,
    this.baseTransactionUpdatedAt,
    this.candidateJson,
  });

  final String id;
  final String sender;
  final String body;
  final int receivedAt;
  final String? linkedTransactionId;
  final int? baseTransactionUpdatedAt;
  final String? candidateJson;

  Map<String, dynamic> toJson() => {
    'id': id,
    'sender': sender,
    'body': body,
    'receivedAt': receivedAt,
    if (linkedTransactionId case final v?) 'linkedTransactionId': v,
    if (baseTransactionUpdatedAt case final v?) 'baseTransactionUpdatedAt': v,
    if (candidateJson case final v?) 'candidateJson': v,
  };
}

class PayeeCategoryRow extends NamedRow {
  const PayeeCategoryRow(super.id, super.name, this.categoryId);
  final String? categoryId;
  @override
  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    if (categoryId != null) 'categoryId': categoryId,
  };
}

class SmsParseResponse {
  const SmsParseResponse({required this.isTransaction, this.candidate});
  final bool isTransaction;
  final SmsCandidatePayload? candidate;

  factory SmsParseResponse.fromJson(Map<String, dynamic> j) {
    final candidate = j['candidate'];
    return SmsParseResponse(
      isTransaction: j['isTransaction'] == true,
      candidate: candidate is Map<String, dynamic>
          ? SmsCandidatePayload.fromJson(candidate)
          : null,
    );
  }
}

class SmsCandidatePayload {
  const SmsCandidatePayload({
    required this.amountCents,
    required this.isIncome,
    required this.date,
    required this.confidence,
    required this.parserVersion,
    this.payee,
    this.accountHint,
    this.bankRef,
    this.currency,
    this.categoryHint,
    this.categoryId,
  });

  final int amountCents;
  final bool isIncome;
  final String date; // YYYY-MM-DD
  final double confidence;
  final int parserVersion;
  final String? payee;
  final String? accountHint;
  final String? bankRef;
  final String? currency;
  final String? categoryHint;
  final String? categoryId;

  factory SmsCandidatePayload.fromJson(Map<String, dynamic> j) =>
      SmsCandidatePayload(
        amountCents: (j['amountCents'] as num).toInt(),
        isIncome: j['isIncome'] == true,
        date: j['date'] as String,
        confidence: (j['confidence'] as num?)?.toDouble() ?? 0.5,
        parserVersion: (j['parserVersion'] as num?)?.toInt() ?? 1,
        payee: j['payee'] as String?,
        accountHint: j['accountHint'] as String?,
        bankRef: j['bankRef'] as String?,
        currency: j['currency'] as String?,
        categoryHint: j['categoryHint'] as String?,
        categoryId: j['categoryId'] as String?,
      );
}

class QuickEntryResponse {
  const QuickEntryResponse({
    required this.amountCents,
    required this.isIncome,
    required this.confidence,
    this.payeeName,
    this.payeeId,
    this.accountHint,
    this.accountId,
    this.categoryHint,
    this.categoryId,
    this.notes,
    this.date,
  });

  final int amountCents;
  final bool isIncome;
  final double confidence;
  final String? payeeName;
  final String? payeeId;
  final String? accountHint;
  final String? accountId;
  final String? categoryHint;
  final String? categoryId;
  final String? notes;
  final String? date; // YYYY-MM-DD or null

  factory QuickEntryResponse.fromJson(Map<String, dynamic> j) =>
      QuickEntryResponse(
        amountCents: (j['amountCents'] as num?)?.toInt() ?? 0,
        isIncome: j['isIncome'] == true,
        confidence: (j['confidence'] as num?)?.toDouble() ?? 0.5,
        payeeName: j['payeeName'] as String?,
        payeeId: j['payeeId'] as String?,
        accountHint: j['accountHint'] as String?,
        accountId: j['accountId'] as String?,
        categoryHint: j['categoryHint'] as String?,
        categoryId: j['categoryId'] as String?,
        notes: j['notes'] as String?,
        date: j['date'] as String?,
      );
}

class PiAiException implements Exception {
  PiAiException(this.message);
  final String message;
  @override
  String toString() => 'PiAiException: $message';
}

final FutureProvider<PiAiClient?> piAiClientProvider =
    FutureProvider<PiAiClient?>((ref) async {
      return PiAiClient.fromSecure(ref.watch(secureStoreProvider));
    });
