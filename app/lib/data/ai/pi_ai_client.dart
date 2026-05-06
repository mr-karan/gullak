import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/secure_store.dart';
import '../../state/providers.dart';

/// HTTP client over the user's homelab pi-server. The server holds the
/// real LLM credentials and runs the prompts; the phone just hands it
/// inputs and reads back JSON. If the user hasn't configured a sync
/// server, [PiAiClient.fromSecure] returns null and any caller must
/// surface that as "AI features need the sync server first".
class PiAiClient {
  PiAiClient({required this.baseUrl, this.apiKey, Dio? dio})
    : _dio = dio ?? Dio();

  final String baseUrl;
  final String? apiKey;
  final Dio _dio;

  static Future<PiAiClient?> fromSecure(SecureStore store) async {
    final base = (await store.readSyncBaseUrl())?.trim();
    if (base == null || base.isEmpty) return null;
    final key = (await store.readSyncApiKey())?.trim();
    return PiAiClient(baseUrl: base, apiKey: key?.isEmpty ?? true ? null : key);
  }

  Map<String, dynamic> get _headers => {
    'content-type': 'application/json',
    'accept': 'application/json',
    if (apiKey != null) 'x-api-key': apiKey,
  };

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
        headers: _headers,
        responseType: ResponseType.json,
        sendTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 30),
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
      throw PiAiException('sms parse failed: ${e.message ?? e.type.name}');
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
        'quick-entry parse failed: ${e.message ?? e.type.name}',
      );
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
      throw PiAiException('feedback send failed: ${e.message ?? e.type.name}');
    }
  }
}

class NamedRow {
  const NamedRow(this.id, this.name);
  final String id;
  final String name;
  Map<String, dynamic> toJson() => {'id': id, 'name': name};
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
