import 'dart:io';

import 'package:drift/native.dart';
import 'package:gullak/core/ai_defaults.dart';
import 'package:gullak/data/ai/llm_client.dart';
import 'package:gullak/data/db/database.dart';
import 'package:gullak/features/accounts/data/account_repository.dart';
import 'package:gullak/features/categories/data/category_repository.dart';
import 'package:gullak/features/entry/ai_extractor.dart';
import 'package:gullak/features/payees/data/payee_repository.dart';

Future<void> main() async {
  final env = Platform.environment;
  final baseUrlOverride = env['AI_BASE_URL']?.trim();
  final modelOverride = env['AI_MODEL']?.trim();
  final apiKey = (env['AI_API_KEY'] ?? env['OPENROUTER_API_KEY'])?.trim();
  final baseUrl = baseUrlOverride == null || baseUrlOverride.isEmpty
      ? kDefaultAiBaseUrl
      : baseUrlOverride;
  final model = modelOverride == null || modelOverride.isEmpty
      ? kDefaultAiModel
      : modelOverride;
  if (apiKey == null || apiKey.isEmpty) {
    stderr.writeln(
      'Set AI_API_KEY (or OPENROUTER_API_KEY) before running '
      'tool/ai_acceptance.dart. Optional overrides: AI_BASE_URL, AI_MODEL.',
    );
    exit(64);
  }

  final db = AppDatabase.forTesting(NativeDatabase.memory());
  try {
    final accounts = AccountRepository(db);
    final categories = CategoryRepository(db);
    final payees = PayeeRepository(db);

    final accountId = await accounts.create(
      name: 'HDFC Bank',
      kind: AccountKind.checking,
    );
    final everyday = await categories.createGroup(name: 'Everyday');
    final income = await categories.createGroup(name: 'Income', isIncome: true);
    await categories.create(name: 'Groceries', groupId: everyday);
    final transportId = await categories.create(
      name: 'Transport',
      groupId: everyday,
    );
    final salaryId = await categories.create(name: 'Salary', groupId: income);
    final blinkitId = await payees.create('Blinkit');
    final zomatoId = await payees.create('Zomato');
    final uberId = await payees.create('Uber');

    final extractor = AiExtractor(
      llm: LlmClient(baseUrl: baseUrl, model: model, apiKey: apiKey),
      accountRepo: accounts,
      categoryRepo: categories,
      payeeRepo: payees,
      minorDigits: 2,
    );

    await _expect(
      extractor,
      phrase: 'blinkit 450 hdfc',
      amountCents: 45000,
      isIncome: false,
      accountId: accountId,
      payeeId: blinkitId,
    );
    await _expect(
      extractor,
      phrase: 'zomato 300 yesterday',
      amountCents: 30000,
      isIncome: false,
      payeeId: zomatoId,
      date: DateTime.now().subtract(const Duration(days: 1)),
    );
    await _expect(
      extractor,
      phrase: 'salary 1.2L',
      amountCents: 12000000,
      isIncome: true,
      categoryId: salaryId,
    );
    await _expect(
      extractor,
      phrase: 'uber 250 split with karan',
      amountCents: 25000,
      isIncome: false,
      payeeId: uberId,
      categoryId: transportId,
      notesContains: 'karan',
    );

    stdout.writeln('AI acceptance passed for $model at $baseUrl');
  } finally {
    await db.close();
  }
}

Future<void> _expect(
  AiExtractor extractor, {
  required String phrase,
  required int amountCents,
  required bool isIncome,
  String? accountId,
  String? categoryId,
  String? payeeId,
  DateTime? date,
  String? notesContains,
}) async {
  final parsed = await extractor.parse(phrase);
  final failures = <String>[];
  if (parsed.amountCents != amountCents) {
    failures.add('amount ${parsed.amountCents} != $amountCents');
  }
  if (parsed.isIncome != isIncome) {
    failures.add('isIncome ${parsed.isIncome} != $isIncome');
  }
  if (accountId != null && parsed.accountId != accountId) {
    failures.add('accountId ${parsed.accountId} != expected');
  }
  if (categoryId != null && parsed.categoryId != categoryId) {
    failures.add('categoryId ${parsed.categoryId} != expected');
  }
  if (payeeId != null && parsed.payeeId != payeeId) {
    failures.add('payeeId ${parsed.payeeId} != expected');
  }
  if (date != null && !_sameDay(parsed.date, date)) {
    failures.add('date ${_ymd(parsed.date)} != ${_ymd(date)}');
  }
  if (notesContains != null &&
      !(parsed.notes ?? '').toLowerCase().contains(notesContains)) {
    failures.add('notes ${parsed.notes} missing $notesContains');
  }
  if (failures.isNotEmpty) {
    stderr.writeln('AI acceptance failed for "$phrase":');
    for (final failure in failures) {
      stderr.writeln('  - $failure');
    }
    exit(1);
  }
  stdout.writeln('ok: $phrase');
}

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

String _ymd(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
