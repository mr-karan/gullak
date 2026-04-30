import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/clock.dart';
import '../../core/logger.dart';
import '../../data/ai/llm_client.dart';
import '../../state/providers.dart';
import '../accounts/data/account_repository.dart';
import '../categories/data/category_repository.dart';
import '../payees/data/payee_repository.dart';

class ParsedExpense {
  const ParsedExpense({
    required this.amountCents,
    required this.isIncome,
    required this.date,
    required this.confidence,
    this.payeeName,
    this.payeeId,
    this.accountHint,
    this.accountId,
    this.categoryHint,
    this.categoryId,
    this.notes,
  });

  final int amountCents;
  final bool isIncome;
  final DateTime date;
  final double confidence;
  final String? payeeName;
  final String? payeeId;
  final String? accountHint;
  final String? accountId;
  final String? categoryHint;
  final String? categoryId;
  final String? notes;
}

const _system = '''
You are an expense parser. Convert the user's note into a structured
expense draft as JSON. Output ONLY a single JSON object.

Schema:
{
  "amount_minor": integer,
  "is_income": boolean,
  "payee": string|null,
  "account_hint": string|null,
  "category_hint": string|null,
  "notes": string|null,
  "date": string|null,
  "confidence": number
}

Rules:
- amount_minor uses the budget's minor units. If the user types "450"
  assume 2 minor digits → 45000. If they type "12.30" → 1230. If
  unsure, return amount_minor with the user's literal digits scaled by 100.
- Do NOT invent payees or accounts. If the user did not say one, return null.
- Do NOT pick a category if you are guessing from a single ambiguous word.
- For "yesterday" / "last friday" — resolve relative to the supplied date.
- Output JSON only.
''';

class AiExtractor {
  AiExtractor({
    required this.llm,
    required this.accountRepo,
    required this.categoryRepo,
    required this.payeeRepo,
    required this.minorDigits,
  });

  final LlmClient llm;
  final AccountRepository accountRepo;
  final CategoryRepository categoryRepo;
  final PayeeRepository payeeRepo;
  final int minorDigits;

  Future<ParsedExpense> parse(String text) async {
    final accounts = await accountRepo.list();
    final categories = await categoryRepo.list();
    final payees = await payeeRepo.list();

    final user = '''
<today>: ${_ymd(clock.today())}
<minor_digits>: $minorDigits
<known_accounts>: ${accounts.take(50).map((a) => a.name).toList()}
<known_categories>: ${categories.take(50).map((c) => c.name).toList()}
<known_payees>: ${payees.take(50).map((p) => p.name).toList()}

Note: $text
''';

    final response = await llm.chatJson(system: _system, user: user);

    final amount = (response['amount_minor'] as num?)?.toInt() ?? 0;
    final isIncome = response['is_income'] == true;
    final payeeName = response['payee'] as String?;
    final accountHint = response['account_hint'] as String?;
    final categoryHint = response['category_hint'] as String?;
    final notes = response['notes'] as String?;
    final dateStr = response['date'] as String?;
    final conf = (response['confidence'] as num?)?.toDouble() ?? 0.5;

    DateTime date;
    if (dateStr == null) {
      date = clock.today();
    } else {
      try {
        date = DateTime.parse(dateStr);
      } catch (_) {
        date = clock.today();
      }
    }
    if (date.isAfter(clock.today())) date = clock.today();

    final accountId = await _matchAccount(accountHint, accounts);
    final payeeId = await _matchPayee(payeeName, payees);
    final categoryId = await _matchCategory(categoryHint, categories);

    log.d('parsed: amount=$amount payee=$payeeName account=$accountHint cat=$categoryHint');

    return ParsedExpense(
      amountCents: amount,
      isIncome: isIncome,
      date: date,
      confidence: conf,
      payeeName: payeeName,
      payeeId: payeeId,
      accountHint: accountHint,
      accountId: accountId,
      categoryHint: categoryHint,
      categoryId: categoryId,
      notes: notes,
    );
  }

  Future<String?> _matchAccount(String? hint, List<AccountRow> accounts) async {
    if (hint == null || accounts.isEmpty) return null;
    final h = hint.toLowerCase();
    for (final a in accounts) {
      if (a.name.toLowerCase() == h) return a.id;
    }
    for (final a in accounts) {
      if (a.name.toLowerCase().contains(h)) return a.id;
    }
    return null;
  }

  Future<String?> _matchPayee(String? hint, List<PayeeRow> payees) async {
    if (hint == null) return null;
    final h = hint.toLowerCase();
    for (final p in payees) {
      if (p.name.toLowerCase() == h) return p.id;
    }
    return null;
  }

  Future<String?> _matchCategory(String? hint, List<CategoryRow> categories) async {
    if (hint == null) return null;
    final h = hint.toLowerCase();
    for (final c in categories) {
      if (c.name.toLowerCase() == h) return c.id;
    }
    for (final c in categories) {
      if (c.name.toLowerCase().contains(h)) return c.id;
    }
    return null;
  }

  static String _ymd(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
}

final FutureProvider<AiExtractor?> aiExtractorProvider =
    FutureProvider<AiExtractor?>((ref) async {
  final llm = await ref.watch(llmClientProvider.future);
  if (llm == null) return null;
  return AiExtractor(
    llm: llm,
    accountRepo: ref.watch(accountRepoProvider),
    categoryRepo: ref.watch(categoryRepoProvider),
    payeeRepo: ref.watch(payeeRepoProvider),
    minorDigits: 2,
  );
});

