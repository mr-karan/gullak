import 'dart:convert';

import 'package:dio/dio.dart';

import '../../core/logger.dart';

class LlmException implements Exception {
  LlmException(this.message);
  final String message;
  @override
  String toString() => 'LlmException: $message';
}

class LlmClient {
  LlmClient({required this.baseUrl, required this.model, this.apiKey, Dio? dio})
    : _dio =
          dio ??
          Dio(
            BaseOptions(
              baseUrl: _normalize(baseUrl),
              connectTimeout: const Duration(seconds: 8),
              receiveTimeout: const Duration(seconds: 25),
              contentType: 'application/json',
              headers: {
                if (apiKey != null && apiKey.isNotEmpty)
                  'authorization': 'Bearer $apiKey',
                'accept': 'application/json',
              },
            ),
          );

  final String baseUrl;
  final String model;
  final String? apiKey;
  final Dio _dio;

  static String _normalize(String u) {
    var url = u.trim();
    if (url.endsWith('/')) url = url.substring(0, url.length - 1);
    return url;
  }

  /// Returns a JSON-decoded map. Caller is responsible for shape validation.
  ///
  /// When [imageBytes] is provided, the user message is sent as a
  /// multimodal content array (text + base64 data URL), letting any
  /// vision-capable OpenAI-compatible model parse a receipt photo.
  Future<Map<String, dynamic>> chatJson({
    required String system,
    required String user,
    bool jsonMode = true,
    List<int>? imageBytes,
    String imageMimeType = 'image/jpeg',
  }) async {
    try {
      final userContent = imageBytes == null || imageBytes.isEmpty
          ? user
          : [
              {'type': 'text', 'text': user},
              {
                'type': 'image_url',
                'image_url': {
                  'url':
                      'data:$imageMimeType;base64,${base64Encode(imageBytes)}',
                },
              },
            ];
      final body = <String, dynamic>{
        'model': model,
        'temperature': 0.1,
        'messages': [
          {'role': 'system', 'content': system},
          {'role': 'user', 'content': userContent},
        ],
        if (jsonMode) 'response_format': {'type': 'json_object'},
      };
      final r = await _dio.post<dynamic>(
        '/chat/completions',
        data: body,
        options: Options(
          // Vision calls are slower; bump receive timeout for them.
          receiveTimeout: imageBytes == null
              ? null
              : const Duration(seconds: 60),
        ),
      );
      final data = r.data;
      if (data is! Map<String, dynamic>) {
        throw LlmException('non-json response');
      }
      final choices = data['choices'] as List<dynamic>?;
      if (choices == null || choices.isEmpty) {
        throw LlmException('no choices in response');
      }
      final msg =
          (choices.first as Map<String, dynamic>)['message']
              as Map<String, dynamic>?;
      final content = msg?['content'] as String?;
      if (content == null) {
        throw LlmException('no content');
      }
      return _parseJson(content);
    } on DioException catch (e) {
      log.w('llm http error: ${e.response?.statusCode} ${e.message}');
      throw LlmException(e.message ?? 'http error');
    }
  }

  static Map<String, dynamic> _parseJson(String raw) {
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
    } catch (_) {
      /* fall through */
    }
    final start = raw.indexOf('{');
    final end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        final decoded = jsonDecode(raw.substring(start, end + 1));
        if (decoded is Map<String, dynamic>) return decoded;
      } catch (_) {}
    }
    throw LlmException('could not extract JSON from model output');
  }
}
