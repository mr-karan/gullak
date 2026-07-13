import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/sms/sms_reply_handler.dart';
import '../router/router.dart';

/// Marked `vm:entry-point` so release tree-shaking keeps it — the OS
/// invokes this in a freshly-spawned isolate after a cold start.
@pragma('vm:entry-point')
void notificationActionBackgroundHandler(NotificationResponse response) {
  if (response.actionId != NotificationService.smsNoteReplyActionId) return;
  final note = response.input?.trim();
  final payload = response.payload;
  if (note == null || note.isEmpty || payload == null) return;
  final smsId = int.tryParse(payload);
  if (smsId == null) return;
  // The plugin keeps the isolate alive long enough for the DB write and
  // the WorkManager enqueue inside `persistReplyAndEnqueue` to finish.
  SmsReplyHandler.persistReplyAndEnqueue(smsId: smsId, note: note);
}

class NotificationService {
  NotificationService._();

  static final NotificationService instance = NotificationService._();

  static const String smsCandidatesChannelId = 'sms_candidates';
  static const String smsNoteReplyActionId = 'sms_note_reply';
  static const String smsCandidatesGroupKey =
      'dev.mrkaran.chavanni.sms_candidates';

  static const _inlineReplyAction = AndroidNotificationAction(
    smsNoteReplyActionId,
    'Add note',
    inputs: [
      AndroidNotificationActionInput(
        label: 'e.g. "decathlon hiking shoes"',
        allowFreeFormInput: true,
      ),
    ],
    showsUserInterface: false,
    cancelNotification: false,
  );

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
      onDidReceiveNotificationResponse: _onForegroundResponse,
      onDidReceiveBackgroundNotificationResponse:
          notificationActionBackgroundHandler,
    );
    _ready = true;
    final launch = await _plugin.getNotificationAppLaunchDetails();
    if (launch?.didNotificationLaunchApp == true &&
        launch?.notificationResponse?.payload != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _openInbox();
      });
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

  /// Android notification ids are 32-bit; clamp to the bottom 31 bits so
  /// later updates target the same notification.
  static int notificationIdForSmsRow(int smsRowId) => smsRowId & 0x7FFFFFFF;

  Future<void> showInboxCandidate({
    required int smsRowId,
    required int amountCents,
    required String? payee,
    String? accountHint,
  }) {
    final tail = accountHint != null && accountHint.isNotEmpty
        ? '\n$accountHint'
        : '';
    return _showSmsPrompt(
      smsRowId: smsRowId,
      summary: _summary(amountCents: amountCents, payee: payee),
      bigText:
          'Tap "Add note" and tell me what this was for — I\'ll fill in '
          'the merchant and category from your reply.$tail',
      body: 'Add what this was for',
    );
  }

  Future<void> showAutoConfirmed({
    required int smsRowId,
    required int amountCents,
    required String? payee,
    String? accountHint,
  }) {
    final tail = accountHint != null && accountHint.isNotEmpty
        ? '\n$accountHint'
        : '';
    return _showSmsPrompt(
      smsRowId: smsRowId,
      summary: _summary(amountCents: amountCents, payee: payee),
      bigText:
          'Saved automatically. Reply with what this was for and I\'ll '
          'fill in the merchant and category.$tail',
      body: 'Saved · tap "Add note" to categorise',
    );
  }

  /// Replace an SMS prompt in-place after the enrichment worker has
  /// resolved a payee/category. Drops the reply action; tap → Inbox.
  Future<void> showEnrichedSummary({
    required int smsRowId,
    required int amountCents,
    required String? payee,
    required String? categoryName,
  }) {
    final tail = categoryName == null
        ? 'Saved as draft — open Inbox to confirm.'
        : 'Saved as $categoryName — open Inbox to confirm.';
    return _showSmsPrompt(
      smsRowId: smsRowId,
      summary: _summary(amountCents: amountCents, payee: payee),
      bigText: tail,
      body: tail,
      withReplyAction: false,
      importance: Importance.defaultImportance,
      priority: Priority.defaultPriority,
      timeout: const Duration(hours: 24),
    );
  }

  Future<void> _showSmsPrompt({
    required int smsRowId,
    required String summary,
    required String bigText,
    required String body,
    bool withReplyAction = true,
    Importance importance = Importance.high,
    Priority priority = Priority.high,
    Duration timeout = const Duration(hours: 2),
  }) async {
    await init();
    final android = AndroidNotificationDetails(
      smsCandidatesChannelId,
      'SMS candidates',
      channelDescription: 'High-confidence transactional SMS drafts',
      groupKey: smsCandidatesGroupKey,
      importance: importance,
      priority: priority,
      timeoutAfter: timeout.inMilliseconds,
      styleInformation: BigTextStyleInformation(bigText, contentTitle: summary),
      actions: withReplyAction ? const [_inlineReplyAction] : const [],
    );
    await _plugin.show(
      id: notificationIdForSmsRow(smsRowId),
      title: summary,
      body: body,
      notificationDetails: NotificationDetails(android: android),
      payload: smsRowId.toString(),
    );
  }

  Future<void> dismissCandidate(int smsRowId) async {
    await _plugin.cancel(id: notificationIdForSmsRow(smsRowId));
  }

  String _summary({required int amountCents, required String? payee}) {
    final amount = '₹${(amountCents.abs() / 100).toStringAsFixed(2)}';
    return payee == null || payee.trim().isEmpty
        ? '$amount spent'
        : '$amount at $payee';
  }

  void _onForegroundResponse(NotificationResponse response) {
    if (response.actionId == smsNoteReplyActionId) {
      notificationActionBackgroundHandler(response);
      return;
    }
    _openInbox();
  }

  void _openInbox() {
    final context = rootNavigatorKey.currentContext;
    if (context != null) context.go('/inbox');
  }
}

final Provider<NotificationService> notificationServiceProvider =
    Provider<NotificationService>((ref) => NotificationService.instance);
