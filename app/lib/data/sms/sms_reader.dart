import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:another_telephony/telephony.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/logger.dart';
import 'sms_models.dart';

const _backgroundSmsQueueKey = 'gullak.sms.backgroundQueue';

@pragma('vm:entry-point')
Future<void> gullakBackgroundSmsHandler(SmsMessage message) async {
  DartPluginRegistrant.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final queue = prefs.getStringList(_backgroundSmsQueueKey) ?? <String>[];
  queue.add(
    jsonEncode({
      'id': message.id?.toString(),
      'address': message.address ?? '',
      'body': message.body ?? '',
      'received_at': message.date ?? DateTime.now().millisecondsSinceEpoch,
    }),
  );
  await prefs.setStringList(_backgroundSmsQueueKey, queue);
}

/// Single entry point for reading SMS on Android. iOS / macOS calls all no-op.
class SmsReader {
  SmsReader._();

  static final SmsReader instance = SmsReader._();

  final _telephony = Platform.isAndroid ? Telephony.instance : null;
  StreamController<IncomingSms>? _controller;
  bool _listening = false;

  bool get isSupported => Platform.isAndroid;

  Future<bool> ensurePermission() async {
    if (!isSupported) return false;
    final smsRead = await Permission.sms.request();
    return smsRead.isGranted;
  }

  Future<List<IncomingSms>> backfill({DateTime? since}) async {
    if (!isSupported) return const [];
    final t = _telephony;
    if (t == null) return const [];
    final granted = await ensurePermission();
    if (!granted) return const [];
    try {
      final messages = await t.getInboxSms(
        columns: [
          SmsColumn.ID,
          SmsColumn.ADDRESS,
          SmsColumn.BODY,
          SmsColumn.DATE,
        ],
        sortOrder: [OrderBy(SmsColumn.DATE, sort: Sort.DESC)],
      );
      return messages
          .where((m) {
            if (since == null) return true;
            final ts = m.date;
            if (ts == null) return true;
            return DateTime.fromMillisecondsSinceEpoch(ts).isAfter(since);
          })
          .map(_mapMessage)
          .toList();
    } catch (e, st) {
      log.w('sms backfill failed', error: e, stackTrace: st);
      return const [];
    }
  }

  Future<List<IncomingSms>> drainBackgroundQueue() async {
    final prefs = await SharedPreferences.getInstance();
    final queue =
        prefs.getStringList(_backgroundSmsQueueKey) ?? const <String>[];
    if (queue.isEmpty) return const [];
    await prefs.remove(_backgroundSmsQueueKey);
    return queue
        .map((raw) {
          try {
            final json = jsonDecode(raw) as Map<String, dynamic>;
            final receivedAt =
                (json['received_at'] as num?)?.toInt() ??
                DateTime.now().millisecondsSinceEpoch;
            return IncomingSms(
              id: json['id'] as String?,
              address: json['address'] as String? ?? '',
              body: json['body'] as String? ?? '',
              receivedAt: DateTime.fromMillisecondsSinceEpoch(receivedAt),
            );
          } catch (e, st) {
            log.w(
              'invalid background sms queue item',
              error: e,
              stackTrace: st,
            );
            return null;
          }
        })
        .whereType<IncomingSms>()
        .toList(growable: false);
  }

  Stream<IncomingSms> listen() {
    final ctrl = _controller ??= StreamController<IncomingSms>.broadcast(
      onCancel: () {
        _controller?.close();
        _controller = null;
        _listening = false;
      },
    );
    if (!isSupported) return ctrl.stream;
    final t = _telephony;
    if (t == null) return ctrl.stream;
    if (_listening) return ctrl.stream;
    _listening = true;
    t.listenIncomingSms(
      onNewMessage: (m) => ctrl.add(_mapMessage(m)),
      onBackgroundMessage: gullakBackgroundSmsHandler,
      listenInBackground: true,
    );
    return ctrl.stream;
  }

  IncomingSms _mapMessage(SmsMessage m) {
    return IncomingSms(
      id: m.id?.toString(),
      address: m.address ?? '',
      body: m.body ?? '',
      receivedAt: m.date == null
          ? DateTime.now()
          : DateTime.fromMillisecondsSinceEpoch(m.date!),
    );
  }
}

final Provider<SmsReader> smsReaderProvider = Provider<SmsReader>(
  (ref) => SmsReader.instance,
);
