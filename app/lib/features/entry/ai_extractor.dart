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
- If an image (receipt) is attached: read the merchant name from the
  printed header for the payee, the grand-total line for amount_minor
  (in the local currency on the receipt), and the receipt date for
  date. Treat handwritten amounts as low-confidence.
- Output JSON only.

Examples:
- "blinkit 450 hdfc groceries" → {"amount_minor":45000,"is_income":false,"payee":"blinkit","account_hint":"hdfc","category_hint":"groceries","notes":null,"date":null,"confidence":0.9}
- "300 zomato yesterday" → {"amount_minor":30000,"is_income":false,"payee":"zomato","account_hint":null,"category_hint":null,"notes":null,"date":"<yesterday>","confidence":0.8}
- "got 5k from mom" → {"amount_minor":500000,"is_income":true,"payee":"mom","account_hint":null,"category_hint":null,"notes":null,"date":null,"confidence":0.85}
- "12.50 coffee" → {"amount_minor":1250,"is_income":false,"payee":"coffee","account_hint":null,"category_hint":null,"notes":null,"date":null,"confidence":0.75}
- "1.5L emi axis" → {"amount_minor":15000000,"is_income":false,"payee":"emi","account_hint":"axis","category_hint":null,"notes":null,"date":null,"confidence":0.75}
- "salary 1.2L" → {"amount_minor":12000000,"is_income":true,"payee":"salary","account_hint":null,"category_hint":"salary","notes":null,"date":null,"confidence":0.85}
- "uber 250 split with karan" → {"amount_minor":25000,"is_income":false,"payee":"uber","account_hint":null,"category_hint":"transport","notes":"split with karan","date":null,"confidence":0.8}
- "\$45 uber" → {"amount_minor":4500,"is_income":false,"payee":"uber","account_hint":null,"category_hint":"transport","notes":null,"date":null,"confidence":0.8}
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

  Future<ParsedExpense> parse(String text) =>
      _parse(noteText: text, imageBytes: null);

  /// Parse a receipt photo: vision-capable model reads the image and
  /// returns the same shaped JSON as the text path.
  Future<ParsedExpense> parseImage(
    List<int> imageBytes, {
    String mimeType = 'image/jpeg',
    String? hint,
  }) => _parse(
    noteText: hint ?? 'Receipt photo. Extract the expense.',
    imageBytes: imageBytes,
    imageMimeType: mimeType,
  );

  Future<ParsedExpense> _parse({
    required String noteText,
    List<int>? imageBytes,
    String imageMimeType = 'image/jpeg',
  }) async {
    final accounts = await accountRepo.list();
    final categories = await categoryRepo.list();
    final payees = await payeeRepo.list();

    final user =
        '''
<today>: ${_ymd(clock.today())}
<minor_digits>: $minorDigits
<known_accounts>: ${accounts.take(50).map((a) => a.name).toList()}
<known_categories>: ${categories.take(50).map((c) => c.name).toList()}
<known_payees>: ${payees.take(50).map((p) => p.name).toList()}

Note: $noteText
''';

    final response = await llm.chatJson(
      system: _system,
      user: user,
      imageBytes: imageBytes,
      imageMimeType: imageMimeType,
    );

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

    log.d(
      'parsed: amount=$amount payee=$payeeName account=$accountHint cat=$categoryHint',
    );

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
    return _matchByName(hint, accounts, (a) => a.name, (a) => a.id);
  }

  Future<String?> _matchPayee(String? hint, List<PayeeRow> payees) async {
    return _matchByName(hint, payees, (p) => p.name, (p) => p.id);
  }

  Future<String?> _matchCategory(
    String? hint,
    List<CategoryRow> categories,
  ) async {
    return _matchByName(hint, categories, (c) => c.name, (c) => c.id);
  }

  String? _matchByName<T>(
    String? hint,
    List<T> rows,
    String Function(T row) nameOf,
    String Function(T row) idOf,
  ) {
    final h = _normaliseHint(hint);
    if (h == null || rows.isEmpty) return null;

    for (final row in rows) {
      if (nameOf(row).toLowerCase() == h) return idOf(row);
    }
    for (final row in rows) {
      final name = nameOf(row).toLowerCase();
      if (name.contains(h) || h.contains(name)) return idOf(row);
    }

    T? best;
    var bestDistance = 3;
    for (final row in rows) {
      final distance = _levenshtein(h, nameOf(row).toLowerCase());
      if (distance < bestDistance) {
        best = row;
        bestDistance = distance;
      }
    }
    return best == null ? null : idOf(best);
  }

  String? _normaliseHint(String? hint) {
    final h = hint?.trim().toLowerCase();
    return h == null || h.isEmpty ? null : h;
  }

  int _levenshtein(String a, String b) {
    if (a == b) return 0;
    if (a.isEmpty) return b.length;
    if (b.isEmpty) return a.length;

    var previous = List<int>.generate(b.length + 1, (i) => i);
    for (var i = 0; i < a.length; i++) {
      final current = List<int>.filled(b.length + 1, 0);
      current[0] = i + 1;
      for (var j = 0; j < b.length; j++) {
        final cost = a.codeUnitAt(i) == b.codeUnitAt(j) ? 0 : 1;
        current[j + 1] = [
          current[j] + 1,
          previous[j + 1] + 1,
          previous[j] + cost,
        ].reduce((value, element) => value < element ? value : element);
      }
      previous = current;
    }
    return previous[b.length];
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
