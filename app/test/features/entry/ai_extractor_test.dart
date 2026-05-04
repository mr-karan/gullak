import 'dart:convert';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/data/ai/llm_client.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/features/accounts/data/account_repository.dart';
import 'package:gullak/features/categories/data/category_repository.dart';
import 'package:gullak/features/entry/ai_extractor.dart';
import 'package:gullak/features/payees/data/payee_repository.dart';

void main() {
  late AppDatabase db;
  late AccountRepository accounts;
  late CategoryRepository categories;
  late PayeeRepository payees;
  late HttpServer server;
  late Uri serverUri;
  Map<String, dynamic>? capturedBody;

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    accounts = AccountRepository(db);
    categories = CategoryRepository(db);
    payees = PayeeRepository(db);

    final groupId = await categories.createGroup(name: 'Everyday');
    final incomeGroupId = await categories.createGroup(
      name: 'Income',
      isIncome: true,
    );
    await accounts.create(name: 'HDFC Bank', kind: AccountKind.checking);
    await categories.create(name: 'Groceries', groupId: groupId);
    await categories.create(name: 'Transport', groupId: groupId);
    await categories.create(name: 'Salary', groupId: incomeGroupId);
    await payees.create('Blinkit');
    await payees.create('Uber');
    await payees.create('Zomato');

    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    serverUri = Uri.parse('http://${server.address.host}:${server.port}');
    server.listen((request) async {
      capturedBody =
          jsonDecode(await utf8.decoder.bind(request).join())
              as Map<String, dynamic>;
      final response = _responseFor(_noteFrom(capturedBody!));
      request.response
        ..statusCode = 200
        ..headers.contentType = ContentType.json
        ..write(
          jsonEncode({
            'choices': [
              {
                'message': {
                  'content': jsonEncode({...response, 'confidence': 0.87}),
                },
              },
            ],
          }),
        );
      await request.response.close();
    });
  });

  tearDown(() async {
    await server.close(force: true);
    await db.close();
  });

  test(
    'passes hints and examples to the model and fuzzy-resolves results',
    () async {
      final extractor = AiExtractor(
        llm: LlmClient(baseUrl: serverUri.toString(), model: 'test-model'),
        accountRepo: accounts,
        categoryRepo: categories,
        payeeRepo: payees,
        minorDigits: 2,
      );

      final parsed = await extractor.parse('blinkit 450 hdfc groceries');
      final account = (await accounts.list()).single;
      final categoriesByName = {
        for (final c in await categories.list()) c.name: c,
      };
      final payeesByName = {for (final p in await payees.list()) p.name: p};

      expect(parsed.amountCents, 45000);
      expect(parsed.accountId, account.id);
      expect(parsed.categoryId, categoriesByName['Groceries']!.id);
      expect(parsed.payeeId, payeesByName['Blinkit']!.id);
      expect(parsed.confidence, 0.87);

      final body = capturedBody!;
      expect(body['model'], 'test-model');
      final messages = body['messages'] as List<dynamic>;
      final system =
          (messages.first as Map<String, dynamic>)['content'] as String;
      final user = (messages.last as Map<String, dynamic>)['content'] as String;
      expect(system, contains('Examples:'));
      expect(system, contains('blinkit 450 hdfc groceries'));
      expect(system, contains('1.5L emi axis'));
      expect(system, contains('salary 1.2L'));
      expect(system, contains('uber 250 split with karan'));
      expect(user, contains('<known_accounts>: [HDFC Bank]'));
      expect(user, contains('<known_categories>:'));
      expect(user, contains('Groceries'));
      expect(user, contains('<known_payees>:'));
      expect(user, contains('Blinkit'));
    },
  );

  test('parses required done-definition phrases from model JSON', () async {
    final extractor = AiExtractor(
      llm: LlmClient(baseUrl: serverUri.toString(), model: 'test-model'),
      accountRepo: accounts,
      categoryRepo: categories,
      payeeRepo: payees,
      minorDigits: 2,
    );
    final account = (await accounts.list()).single;
    final categoriesByName = {
      for (final c in await categories.list()) c.name: c,
    };
    final payeesByName = {for (final p in await payees.list()) p.name: p};

    final blinkit = await extractor.parse('blinkit 450 hdfc');
    expect(blinkit.amountCents, 45000);
    expect(blinkit.isIncome, isFalse);
    expect(blinkit.accountId, account.id);
    expect(blinkit.payeeId, payeesByName['Blinkit']!.id);

    final zomato = await extractor.parse('zomato 300 yesterday');
    expect(zomato.amountCents, 30000);
    expect(zomato.isIncome, isFalse);
    expect(zomato.payeeId, payeesByName['Zomato']!.id);
    expect(zomato.date, DateTime(2026, 5, 3));

    final salary = await extractor.parse('salary 1.2L');
    expect(salary.amountCents, 12000000);
    expect(salary.isIncome, isTrue);
    expect(salary.categoryId, categoriesByName['Salary']!.id);

    final uber = await extractor.parse('uber 250 split with karan');
    expect(uber.amountCents, 25000);
    expect(uber.isIncome, isFalse);
    expect(uber.payeeId, payeesByName['Uber']!.id);
    expect(uber.categoryId, categoriesByName['Transport']!.id);
    expect(uber.notes, 'split with karan');
  });
}

String _noteFrom(Map<String, dynamic> request) {
  final messages = request['messages'] as List<dynamic>;
  final user = (messages.last as Map<String, dynamic>)['content'] as String;
  return user.split('Note:').last.trim();
}

Map<String, dynamic> _responseFor(String note) {
  switch (note) {
    case 'blinkit 450 hdfc':
    case 'blinkit 450 hdfc groceries':
      return {
        'amount_minor': 45000,
        'is_income': false,
        'payee': 'Blinkt',
        'account_hint': 'hdfc',
        'category_hint': 'Grocerie',
        'notes': null,
        'date': '2026-05-04',
      };
    case 'zomato 300 yesterday':
      return {
        'amount_minor': 30000,
        'is_income': false,
        'payee': 'Zomto',
        'account_hint': null,
        'category_hint': null,
        'notes': null,
        'date': '2026-05-03',
      };
    case 'salary 1.2L':
      return {
        'amount_minor': 12000000,
        'is_income': true,
        'payee': 'salary',
        'account_hint': null,
        'category_hint': 'Sallary',
        'notes': null,
        'date': null,
      };
    case 'uber 250 split with karan':
      return {
        'amount_minor': 25000,
        'is_income': false,
        'payee': 'Ubr',
        'account_hint': null,
        'category_hint': 'Transprt',
        'notes': 'split with karan',
        'date': null,
      };
  }
  throw StateError('unexpected note: $note');
}
