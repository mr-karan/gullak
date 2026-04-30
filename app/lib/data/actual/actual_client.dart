import 'package:dio/dio.dart';

import '../../core/logger.dart';
import 'actual_dto.dart';

class ActualClientException implements Exception {
  ActualClientException(this.message, {this.statusCode, this.cause});
  final String message;
  final int? statusCode;
  final Object? cause;

  @override
  String toString() => 'ActualClientException(${statusCode ?? '-'}): $message';
}

/// HTTP client for `actual-http-api`.
///
/// Base URL like `https://actualapi.example.com` or `http://192.168.1.5:5007`.
/// All endpoints are under `/v1`.
class ActualClient {
  ActualClient({
    required this.baseUrl,
    required this.apiKey,
    Dio? dio,
    this.budgetEncryptionPassword,
  }) : _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: _normalize(baseUrl),
                connectTimeout: const Duration(seconds: 10),
                receiveTimeout: const Duration(seconds: 25),
                sendTimeout: const Duration(seconds: 15),
                contentType: 'application/json',
                responseType: ResponseType.json,
                headers: {
                  'x-api-key': apiKey,
                  'accept': 'application/json',
                },
              ),
            ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (o, h) {
          log.d('-> ${o.method} ${o.uri}');
          return h.next(o);
        },
        onError: (e, h) {
          log.w('xx ${e.requestOptions.method} ${e.requestOptions.uri} -> ${e.response?.statusCode} ${e.message}');
          return h.next(e);
        },
      ),
    );
  }

  final String baseUrl;
  final String apiKey;
  final String? budgetEncryptionPassword;
  final Dio _dio;

  static String _normalize(String url) {
    var u = url.trim();
    if (u.endsWith('/')) u = u.substring(0, u.length - 1);
    if (!u.endsWith('/v1')) u = '$u/v1';
    return u;
  }

  Map<String, dynamic> get _encQuery => budgetEncryptionPassword == null
      ? const {}
      : {'budgetEncryptionPassword': budgetEncryptionPassword};

  Future<List<BudgetDto>> getBudgets() async {
    try {
      final r = await _dio.get<dynamic>('/budgets');
      final data = _data(r);
      return (data as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(BudgetDto.fromJson)
          .toList();
    } on DioException catch (e) {
      throw _wrap(e, 'list budgets');
    }
  }

  Future<List<ActualAccountDto>> getAccounts(String budgetSyncId) async {
    try {
      final r = await _dio.get<dynamic>(
        '/budgets/$budgetSyncId/accounts',
        queryParameters: _encQuery,
      );
      final data = _data(r);
      return (data as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(ActualAccountDto.fromJson)
          .toList();
    } on DioException catch (e) {
      throw _wrap(e, 'list accounts');
    }
  }

  Future<List<ActualCategoryGroupDto>> getCategoryGroups(String budgetSyncId) async {
    try {
      final r = await _dio.get<dynamic>(
        '/budgets/$budgetSyncId/categorygroups',
        queryParameters: {..._encQuery, 'includeCategories': true},
      );
      final data = _data(r);
      return (data as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(ActualCategoryGroupDto.fromJson)
          .toList();
    } on DioException catch (e) {
      throw _wrap(e, 'list category groups');
    }
  }

  Future<List<ActualCategoryDto>> getCategories(String budgetSyncId) async {
    try {
      final r = await _dio.get<dynamic>(
        '/budgets/$budgetSyncId/categories',
        queryParameters: _encQuery,
      );
      final data = _data(r);
      return (data as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(ActualCategoryDto.fromJson)
          .toList();
    } on DioException catch (e) {
      throw _wrap(e, 'list categories');
    }
  }

  Future<List<ActualPayeeDto>> getPayees(String budgetSyncId) async {
    try {
      final r = await _dio.get<dynamic>(
        '/budgets/$budgetSyncId/payees',
        queryParameters: _encQuery,
      );
      final data = _data(r);
      return (data as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(ActualPayeeDto.fromJson)
          .toList();
    } on DioException catch (e) {
      throw _wrap(e, 'list payees');
    }
  }

  Future<String> createPayee(String budgetSyncId, String name) async {
    try {
      final r = await _dio.post<dynamic>(
        '/budgets/$budgetSyncId/payees',
        queryParameters: _encQuery,
        data: {
          'payee': {'name': name},
        },
      );
      final data = _data(r) as Map<String, dynamic>;
      return (data['id'] ?? '') as String;
    } on DioException catch (e) {
      throw _wrap(e, 'create payee');
    }
  }

  Future<List<ActualTransactionDto>> getTransactions({
    required String budgetSyncId,
    required String accountId,
    required DateTime sinceDate,
    DateTime? untilDate,
  }) async {
    try {
      final since = _ymd(sinceDate);
      final qp = <String, dynamic>{
        'since_date': since,
        ..._encQuery,
      };
      if (untilDate != null) qp['until_date'] = _ymd(untilDate);
      final r = await _dio.get<dynamic>(
        '/budgets/$budgetSyncId/accounts/$accountId/transactions',
        queryParameters: qp,
      );
      final data = _data(r);
      return (data as List<dynamic>)
          .whereType<Map<String, dynamic>>()
          .map(ActualTransactionDto.fromJson)
          .toList();
    } on DioException catch (e) {
      throw _wrap(e, 'list transactions');
    }
  }

  Future<void> importTransactions({
    required String budgetSyncId,
    required String accountId,
    required List<ActualTransactionDto> transactions,
  }) async {
    if (transactions.isEmpty) return;
    try {
      await _dio.post<dynamic>(
        '/budgets/$budgetSyncId/accounts/$accountId/transactions/import',
        queryParameters: _encQuery,
        data: {
          'transactions': transactions.map((t) => t.toJsonForCreate()).toList(),
        },
      );
    } on DioException catch (e) {
      throw _wrap(e, 'import transactions');
    }
  }

  Future<void> createTransaction({
    required String budgetSyncId,
    required String accountId,
    required ActualTransactionDto transaction,
    bool learnCategories = false,
    bool runTransfers = false,
  }) async {
    try {
      await _dio.post<dynamic>(
        '/budgets/$budgetSyncId/accounts/$accountId/transactions',
        queryParameters: _encQuery,
        data: {
          'learnCategories': learnCategories,
          'runTransfers': runTransfers,
          'transaction': transaction.toJsonForCreate(),
        },
      );
    } on DioException catch (e) {
      throw _wrap(e, 'create transaction');
    }
  }

  Future<void> patchTransaction({
    required String budgetSyncId,
    required String transactionId,
    required Map<String, dynamic> fields,
  }) async {
    try {
      await _dio.patch<dynamic>(
        '/budgets/$budgetSyncId/transactions/$transactionId',
        queryParameters: _encQuery,
        data: {'transaction': fields},
      );
    } on DioException catch (e) {
      throw _wrap(e, 'update transaction');
    }
  }

  Future<void> deleteTransaction({
    required String budgetSyncId,
    required String transactionId,
  }) async {
    try {
      await _dio.delete<dynamic>(
        '/budgets/$budgetSyncId/transactions/$transactionId',
        queryParameters: _encQuery,
      );
    } on DioException catch (e) {
      throw _wrap(e, 'delete transaction');
    }
  }

  /// Quick health check used in onboarding "Test connection".
  Future<bool> ping() async {
    try {
      await _dio.get<dynamic>('/budgets');
      return true;
    } on DioException {
      return false;
    }
  }

  static String _ymd(DateTime d) {
    final mm = d.month.toString().padLeft(2, '0');
    final dd = d.day.toString().padLeft(2, '0');
    return '${d.year}-$mm-$dd';
  }

  static dynamic _data(Response<dynamic> r) {
    final body = r.data;
    if (body is Map<String, dynamic> && body.containsKey('data')) {
      return body['data'];
    }
    return body;
  }

  static ActualClientException _wrap(DioException e, String op) {
    final code = e.response?.statusCode;
    final body = e.response?.data;
    final msg = body is Map ? (body['message'] ?? body['error'] ?? e.message) : e.message;
    return ActualClientException(
      'failed to $op: $msg',
      statusCode: code,
      cause: e,
    );
  }
}
