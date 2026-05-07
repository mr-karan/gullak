import 'dart:convert';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/ai/pi_ai_client.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/features/accounts/data/account_repository.dart';
import 'package:gullak/features/categories/data/category_repository.dart';
import 'package:gullak/features/entry/ai_extractor.dart';
import 'package:gullak/features/payees/data/payee_repository.dart';
import 'package:gullak/features/rules/data/rule_repository.dart';

/// The Flutter app no longer talks to OpenRouter — it posts the
/// QuickEntry note (and the user's library) to pi-server's
/// /v1/ai/quick-entry/parse and reads back already-resolved IDs. This
/// test stands up a fake of that endpoint and asserts (a) the right
/// payload goes out, (b) the response shape is mapped to a
/// [ParsedExpense] correctly.
void main() {
  late AppDatabase db;
  late AccountRepository accounts;
  late CategoryRepository categories;
  late PayeeRepository payees;
  late RuleRepository rules;
  late HttpServer server;
  late Uri serverUri;
  Map<String, dynamic>? capturedBody;
  late Map<String, String> accountIds;
  late Map<String, String> payeeIds;
  late Map<String, String> categoryIds;

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    accounts = AccountRepository(db);
    categories = CategoryRepository(db);
    payees = PayeeRepository(db);
    rules = RuleRepository(db);

    final groupId = await categories.createGroup(name: 'Everyday');
    final incomeGroupId = await categories.createGroup(
      name: 'Income',
      isIncome: true,
    );
    accountIds = {
      'HDFC Bank': await accounts.create(
        name: 'HDFC Bank',
        kind: AccountKind.savings,
      ),
    };
    categoryIds = {
      'Groceries': await categories.create(name: 'Groceries', groupId: groupId),
      'Transport': await categories.create(name: 'Transport', groupId: groupId),
      'Salary': await categories.create(name: 'Salary', groupId: incomeGroupId),
    };
    payeeIds = {
      'Blinkit': await payees.create('Blinkit'),
      'Uber': await payees.create('Uber'),
      'Zomato': await payees.create('Zomato'),
    };
    await rules.upsertRule(
      id: payeeIds['Blinkit'],
      name: 'Payee memory',
      triggerType: 'payee',
      triggerPayload: {'payeeId': payeeIds['Blinkit'], 'match': 'equals'},
      actionPayload: {'categoryId': categoryIds['Groceries']},
    );

    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    serverUri = Uri.parse('http://${server.address.host}:${server.port}');
    server.listen((request) async {
      final body =
          jsonDecode(await utf8.decoder.bind(request).join())
              as Map<String, dynamic>;
      capturedBody = body;
      final note = body['text'] as String;
      final response = _responseFor(
        note,
        accountIds: accountIds,
        payeeIds: payeeIds,
        categoryIds: categoryIds,
      );
      request.response
        ..statusCode = 200
        ..headers.contentType = ContentType.json
        ..write(jsonEncode(response));
      await request.response.close();
    });
  });

  tearDown(() async {
    await server.close(force: true);
    await db.close();
  });

  test('passes the user library and shapes the server response back', () async {
    final extractor = AiExtractor(
      client: PiAiClient(baseUrl: serverUri.toString()),
      accountRepo: accounts,
      categoryRepo: categories,
      payeeRepo: payees,
      ruleRepo: rules,
      minorDigits: 2,
    );

    final parsed = await extractor.parse('blinkit 450 hdfc groceries');

    expect(parsed.amountCents, 45000);
    expect(parsed.accountId, accountIds['HDFC Bank']);
    expect(parsed.categoryId, categoryIds['Groceries']);
    expect(parsed.payeeId, payeeIds['Blinkit']);
    expect(parsed.confidence, 0.87);

    final body = capturedBody!;
    expect(body['text'], 'blinkit 450 hdfc groceries');
    expect(body['minorDigits'], 2);
    expect(
      (body['accounts'] as List<dynamic>).map((a) => (a as Map)['name']),
      contains('HDFC Bank'),
    );
    expect(
      (body['categories'] as List<dynamic>).map((c) => (c as Map)['name']),
      contains('Groceries'),
    );
    expect(
      (body['payees'] as List<dynamic>).map((p) => (p as Map)['name']),
      contains('Blinkit'),
    );
    final blinkit = (body['payees'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .firstWhere((p) => p['name'] == 'Blinkit');
    expect(blinkit['categoryId'], 'Groceries');
  });

  test('income, dates, and notes round-trip through the server', () async {
    final extractor = AiExtractor(
      client: PiAiClient(baseUrl: serverUri.toString()),
      accountRepo: accounts,
      categoryRepo: categories,
      payeeRepo: payees,
      ruleRepo: rules,
      minorDigits: 2,
    );

    final salary = await extractor.parse('salary 1.2L');
    expect(salary.amountCents, 12000000);
    expect(salary.isIncome, isTrue);
    expect(salary.categoryId, categoryIds['Salary']);

    final uber = await extractor.parse('uber 250 split with karan');
    expect(uber.amountCents, 25000);
    expect(uber.isIncome, isFalse);
    expect(uber.payeeId, payeeIds['Uber']);
    expect(uber.categoryId, categoryIds['Transport']);
    expect(uber.notes, 'split with karan');

    final zomato = await extractor.parse('zomato 300 yesterday');
    expect(zomato.amountCents, 30000);
    expect(zomato.payeeId, payeeIds['Zomato']);
    expect(zomato.date, DateTime(2026, 5, 4));
  });
}

/// Server-side fake — mirrors the shape pi-server's
/// /v1/ai/quick-entry/parse returns: amounts in minor units and IDs
/// already resolved against the libraries the client sent in.
Map<String, dynamic> _responseFor(
  String note, {
  required Map<String, String> accountIds,
  required Map<String, String> payeeIds,
  required Map<String, String> categoryIds,
}) {
  switch (note) {
    case 'blinkit 450 hdfc groceries':
      return {
        'amountCents': 45000,
        'isIncome': false,
        'payeeName': 'Blinkit',
        'payeeId': payeeIds['Blinkit'],
        'accountHint': 'hdfc',
        'accountId': accountIds['HDFC Bank'],
        'categoryHint': 'Groceries',
        'categoryId': categoryIds['Groceries'],
        'notes': null,
        'date': null,
        'confidence': 0.87,
      };
    case 'salary 1.2L':
      return {
        'amountCents': 12000000,
        'isIncome': true,
        'payeeName': null,
        'payeeId': null,
        'accountHint': null,
        'accountId': null,
        'categoryHint': 'Salary',
        'categoryId': categoryIds['Salary'],
        'notes': null,
        'date': null,
        'confidence': 0.85,
      };
    case 'uber 250 split with karan':
      return {
        'amountCents': 25000,
        'isIncome': false,
        'payeeName': 'Uber',
        'payeeId': payeeIds['Uber'],
        'accountHint': null,
        'accountId': null,
        'categoryHint': 'Transport',
        'categoryId': categoryIds['Transport'],
        'notes': 'split with karan',
        'date': null,
        'confidence': 0.8,
      };
    case 'zomato 300 yesterday':
      return {
        'amountCents': 30000,
        'isIncome': false,
        'payeeName': 'Zomato',
        'payeeId': payeeIds['Zomato'],
        'accountHint': null,
        'accountId': null,
        'categoryHint': null,
        'categoryId': null,
        'notes': null,
        'date': '2026-05-04',
        'confidence': 0.8,
      };
  }
  throw StateError('unexpected note: $note');
}
