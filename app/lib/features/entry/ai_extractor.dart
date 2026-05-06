import 'dart:typed_data';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/clock.dart';
import '../../core/logger.dart';
import '../../data/ai/pi_ai_client.dart';
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

/// Thin wrapper that gathers the user's local accounts/categories/payees
/// and asks the homelab pi-server to parse the QuickEntry note (or
/// receipt photo) into a [ParsedExpense]. The server holds the LLM
/// credentials and runs the prompt; this class just shapes inputs +
/// outputs.
class AiExtractor {
  AiExtractor({
    required this.client,
    required this.accountRepo,
    required this.categoryRepo,
    required this.payeeRepo,
    required this.minorDigits,
    this.payeeCategoryHintsJson = '{}',
  });

  final PiAiClient client;
  final AccountRepository accountRepo;
  final CategoryRepository categoryRepo;
  final PayeeRepository payeeRepo;
  final int minorDigits;
  final String payeeCategoryHintsJson;

  Future<ParsedExpense> parse(String text) =>
      _parse(noteText: text, imageBytes: null);

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
    final categoryHints = _decodeHints(payeeCategoryHintsJson);

    final response = await client.parseQuickEntry(
      text: noteText,
      today: _ymd(clock.today()),
      minorDigits: minorDigits,
      accounts: accounts.map((a) => NamedRow(a.id, a.name)).toList(),
      categories: categories.map((c) => NamedRow(c.id, c.name)).toList(),
      payees: payees
          .map((p) => PayeeCategoryRow(p.id, p.name, categoryHints[p.id]))
          .toList(),
      imageBytes: imageBytes == null ? null : Uint8List.fromList(imageBytes),
      imageMimeType: imageMimeType,
    );

    DateTime date;
    if (response.date == null) {
      date = clock.today();
    } else {
      date = DateTime.tryParse(response.date!) ?? clock.today();
      if (date.isAfter(clock.today())) date = clock.today();
    }

    log.d(
      'parsed: amount=${response.amountCents} payee=${response.payeeName} '
      'account=${response.accountHint} cat=${response.categoryHint}',
    );

    return ParsedExpense(
      amountCents: response.amountCents,
      isIncome: response.isIncome,
      date: date,
      confidence: response.confidence,
      payeeName: response.payeeName,
      payeeId: response.payeeId,
      accountHint: response.accountHint,
      accountId: response.accountId,
      categoryHint: response.categoryHint,
      categoryId: response.categoryId,
      notes: response.notes,
    );
  }

  static String _ymd(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  Map<String, String> _decodeHints(String raw) {
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      return m.map((k, v) => MapEntry(k, v is String ? v : ''))
        ..removeWhere((_, v) => v.isEmpty);
    } catch (_) {
      return const {};
    }
  }
}

final FutureProvider<AiExtractor?> aiExtractorProvider =
    FutureProvider<AiExtractor?>((ref) async {
      final client = await ref.watch(piAiClientProvider.future);
      if (client == null) return null;
      return AiExtractor(
        client: client,
        accountRepo: ref.watch(accountRepoProvider),
        categoryRepo: ref.watch(categoryRepoProvider),
        payeeRepo: ref.watch(payeeRepoProvider),
        minorDigits: 2,
        payeeCategoryHintsJson: ref.watch(prefsProvider).payeeCategoryHints,
      );
    });
