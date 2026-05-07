import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/logger.dart';
import '../../features/categories/data/category_repository.dart';
import '../../features/payees/data/payee_repository.dart';
import '../../features/rules/data/rule_repository.dart';
import '../ai/pi_ai_client.dart';
import 'sms_models.dart';
import 'sms_parser.dart';

/// SMS parser that delegates the actual LLM work to the homelab
/// pi-server. The phone never sees an OpenRouter / OpenAI key — it
/// just hands the SMS to `/v1/ai/sms/parse` and reads back the typed
/// candidate.
class LlmSmsParser implements SmsParser {
  LlmSmsParser(
    this._client,
    this._categoryRepo,
    this._payeeRepo,
    this._ruleRepo,
  );
  final PiAiClient _client;
  final CategoryRepository _categoryRepo;
  final PayeeRepository _payeeRepo;
  final RuleRepository _ruleRepo;

  @override
  Future<SmsCandidate?> parse(IncomingSms sms) async {
    final SmsParseResponse response;
    try {
      final categories = await _categoryRepo.list();
      final payees = await _payeeRepo.list();
      final categoryById = {for (final c in categories) c.id: c.name};
      final payeeCategoryHintIds = await _ruleRepo.payeeCategoryHintIds();
      response = await _client.parseSms(
        sender: sms.address,
        body: sms.body,
        receivedAt: sms.receivedAt,
        categories: categories.map((c) => NamedRow(c.id, c.name)).toList(),
        payees: payees
            .map(
              (p) => PayeeCategoryRow(
                p.id,
                p.name,
                categoryById[payeeCategoryHintIds[p.id]],
              ),
            )
            .toList(),
      );
    } on PiAiException catch (e) {
      log.w('pi-server sms parse failed: ${e.message}');
      return null;
    }
    if (!response.isTransaction || response.candidate == null) return null;
    final c = response.candidate!;
    return SmsCandidate(
      amountCents: c.amountCents,
      isIncome: c.isIncome,
      date: DateTime.tryParse(c.date) ?? sms.receivedAt,
      confidence: c.confidence,
      payee: c.payee,
      accountHint: c.accountHint,
      bankRef: c.bankRef,
      categoryHint: c.categoryHint,
      categoryId: c.categoryId,
      parserVersion: c.parserVersion,
    );
  }
}

final FutureProvider<LlmSmsParser?> llmSmsParserProvider =
    FutureProvider<LlmSmsParser?>((ref) async {
      final client = await ref.watch(piAiClientProvider.future);
      if (client == null) return null;
      return LlmSmsParser(
        client,
        ref.watch(categoryRepoProvider),
        ref.watch(payeeRepoProvider),
        ref.watch(ruleRepoProvider),
      );
    });
