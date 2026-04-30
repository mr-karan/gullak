import 'dart:async';
import 'dart:io';

import 'package:another_telephony/telephony.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/logger.dart';
import 'sms_models.dart';

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
        sortOrder: [
          OrderBy(SmsColumn.DATE, sort: Sort.DESC),
        ],
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
      listenInBackground: false,
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

final Provider<SmsReader> smsReaderProvider =
    Provider<SmsReader>((ref) => SmsReader.instance);
