import 'package:another_telephony/telephony.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/sms/sms_reader.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('background handler queues messages for foreground drain', () async {
    SharedPreferences.setMockInitialValues({});
    final receivedAt = DateTime(2026, 1, 2, 10).millisecondsSinceEpoch;
    final sms = SmsMessage.fromMap(
      {
        '_id': '42',
        'address': 'VK-HDFCBK',
        'body': 'Rs.450.00 debited from HDFC Bank card xx1234 at BLINKIT.',
        'date': '$receivedAt',
      },
      [SmsColumn.ID, SmsColumn.ADDRESS, SmsColumn.BODY, SmsColumn.DATE],
    );

    await gullakBackgroundSmsHandler(sms);

    final drained = await SmsReader.instance.drainBackgroundQueue();
    expect(drained, hasLength(1));
    expect(drained.single.id, '42');
    expect(drained.single.address, 'VK-HDFCBK');
    expect(drained.single.body, contains('BLINKIT'));
    expect(
      drained.single.receivedAt,
      DateTime.fromMillisecondsSinceEpoch(receivedAt),
    );

    expect(await SmsReader.instance.drainBackgroundQueue(), isEmpty);
  });
}
