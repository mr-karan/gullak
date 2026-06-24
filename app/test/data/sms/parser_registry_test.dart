import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/data/sms/parser_registry.dart';
import 'package:gullak/data/sms/sms_models.dart';
import 'package:gullak/data/sms/sms_parser.dart';

class _ThrowingParser implements SmsParser {
  @override
  Future<SmsCandidate?> parse(IncomingSms sms) async =>
      throw const FormatException('malformed pi-server response');
}

void main() {
  test('tryParse swallows parser exceptions and returns null (#3 no silent drop)',
      () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    final reg = ParserRegistry(
      db: db,
      parserLoader: () async => _ThrowingParser(),
    );
    // A body the deterministic parser can't parse → falls through to the
    // (throwing) LLM parser. The exception must be caught, not propagated,
    // so _ingest still writes an error row instead of dropping the SMS.
    final sms = IncomingSms(
      id: '1',
      address: 'XX-BANK',
      body: 'your statement is ready to view',
      receivedAt: DateTime(2026, 6, 24),
    );

    final result = await reg.tryParse(sms);
    expect(result, isNull);
    await db.close();
  });
}
