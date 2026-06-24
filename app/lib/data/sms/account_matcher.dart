/// Maps an SMS-derived account hint (e.g. "HDFC Card x4904",
/// "Kotak Bank AC X2746", "HDFC Bank A/C *9639") to a specific account id.
///
/// Scoring, not naive substring matching, so it can disambiguate multiple
/// accounts at the same bank (e.g. "HDFC Bank" savings vs "HDFC Regalia
/// Credit Card") using card-vs-bank wording and last-4 digits.
///
/// Returns `null` when there is no confident, unambiguous match — callers
/// decide the fallback (review vs. default account) rather than this guessing.
library;

typedef AccountLite = ({String id, String name, String kind});

/// Words that appear in account names but don't identify a *specific* bank.
const _generic = <String>{
  'bank', 'credit', 'card', 'cc', 'upi', 'wallet', 'savings', 'current',
  'account', 'acct', 'ac', 'the', 'no', 'x', 'xx', 'xxxx',
};

final _wordSplit = RegExp(r'[^a-z0-9]+');
// Masked account/card suffixes the deterministic parser emits are 3-6 digits.
final _digitRun = RegExp(r'\d{3,6}');
// Word-bounded so "credited" (account-credit alerts) doesn't read as a card.
final _cardWords = RegExp(r'\bcard\b|\bcc\b|\bcredit\b');
final _bankWords = RegExp(r'\bbank\b|\ba/?c\b|\bacc?t?\b|savings|current|upi|wallet');

String? matchAccountHint(String? hint, List<AccountLite> accounts) {
  if (hint == null) return null;
  final h = hint.toLowerCase().trim();
  if (h.isEmpty || accounts.isEmpty) return null;

  final hintDigits = _digitRun.allMatches(h).map((m) => m.group(0)!).toList();
  final looksCard = _cardWords.hasMatch(h);
  final looksBank = _bankWords.hasMatch(h);

  var bestScore = 0;
  String? bestId;
  var tied = false;

  for (final a in accounts) {
    final isCard = a.kind == 'credit_card';
    var score = 0;

    // Distinctive brand/bank token shared between the account name and hint
    // (e.g. "hdfc", "axis", "idfc", "kotak", "regalia", "amex").
    for (final w in a.name.toLowerCase().split(_wordSplit)) {
      if (w.length < 3 || _generic.contains(w)) continue;
      if (RegExp('\\b${RegExp.escape(w)}\\b').hasMatch(h)) score += 2;
    }

    // Strong signal: a last-4 digit group from the hint embedded in the name.
    for (final d in hintDigits) {
      if (a.name.contains(d)) score += 3;
    }

    // Only disambiguate by card-ness once the bank already matched, so a
    // stray "card" in the hint can't pull an unrelated credit card.
    if (score > 0) {
      if (looksCard && isCard) score += 1;
      if (looksBank && !isCard) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestId = a.id;
      tied = false;
    } else if (score == bestScore && score > 0) {
      tied = true;
    }
  }

  if (bestId == null || bestScore < 2 || tied) return null;
  return bestId;
}
