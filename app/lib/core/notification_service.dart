import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../router/router.dart';

class NotificationService {
  NotificationService._();

  static final NotificationService instance = NotificationService._();

  final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  bool _ready = false;

  Future<void> init() async {
    if (_ready) return;
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const darwin = DarwinInitializationSettings();
    await _plugin.initialize(
      settings: const InitializationSettings(
        android: android,
        iOS: darwin,
        macOS: darwin,
      ),
      onDidReceiveNotificationResponse: (response) {
        if (response.payload == 'inbox') _openInbox();
      },
    );
    _ready = true;
    final launch = await _plugin.getNotificationAppLaunchDetails();
    if (launch?.didNotificationLaunchApp == true &&
        launch?.notificationResponse?.payload == 'inbox') {
      WidgetsBinding.instance.addPostFrameCallback((_) => _openInbox());
    }
  }

  Future<bool> requestPermission() async {
    await init();
    if (!Platform.isAndroid) return true;
    return await _plugin
            .resolvePlatformSpecificImplementation<
              AndroidFlutterLocalNotificationsPlugin
            >()
            ?.requestNotificationsPermission() ??
        true;
  }

  Future<void> showInboxCandidate({
    required int amountCents,
    required String? payee,
  }) async {
    await init();
    const androidDetails = AndroidNotificationDetails(
      'sms_candidates',
      'SMS candidates',
      channelDescription: 'High-confidence transactional SMS drafts',
      importance: Importance.high,
      priority: Priority.high,
    );
    const details = NotificationDetails(android: androidDetails);
    await _plugin.show(
      id: 1001,
      title: 'New transaction draft',
      body: _body(amountCents: amountCents, payee: payee),
      notificationDetails: details,
      payload: 'inbox',
    );
  }

  String _body({required int amountCents, required String? payee}) {
    final amount = '₹${(amountCents.abs() / 100).toStringAsFixed(2)}';
    return payee == null || payee.trim().isEmpty
        ? '$amount is ready to review'
        : '$amount at $payee is ready to review';
  }

  void _openInbox() {
    final context = rootNavigatorKey.currentContext;
    if (context != null) context.go('/inbox');
  }
}

final Provider<NotificationService> notificationServiceProvider =
    Provider<NotificationService>((ref) => NotificationService.instance);
