import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';

bool isOfflineError(Object e) {
  if (e is TimeoutException || e is SocketException) return true;
  if (e is! DioException) return false;
  return switch (e.type) {
    DioExceptionType.connectionTimeout ||
    DioExceptionType.sendTimeout ||
    DioExceptionType.receiveTimeout ||
    DioExceptionType.connectionError => true,
    _ => e.error is SocketException,
  };
}

String networkErrorMessage(Object e) {
  if (isOfflineError(e)) {
    return 'Sync server offline. Check Tailscale/VPN and try again.';
  }
  if (e is DioException) {
    final status = e.response?.statusCode;
    if (status == 401) return 'Unauthorized — check the sync API key.';
    if (status != null) return 'Sync server error ($status).';
    return e.message ?? e.type.name;
  }
  if (e is TimeoutException) {
    return 'Sync server timed out. Check Tailscale/VPN and try again.';
  }
  return '$e';
}
