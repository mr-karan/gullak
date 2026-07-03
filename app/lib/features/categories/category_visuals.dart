import 'package:flutter/material.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

Color categoryAccentColor(int? storedColor, String name) {
  if (storedColor != null) return Color(storedColor);
  return _resolveAccent(name);
}

IconData categoryIconData(String name) => _resolveIcon(name);

/// Kept for legacy callers (the categories table still stores user-picked
/// emoji strings in `icon`). New surfaces should use [categoryIconData].
String categoryEmoji(String? icon, String name) {
  final explicit = icon?.trim();
  if (explicit != null && explicit.isNotEmpty) return explicit;
  return _emojiFor(name.toLowerCase());
}

String defaultCategoryEmoji(String name) => categoryEmoji(null, name);

// Hot path: this resolver runs once per visible Activity row per render.
// Avoid per-call list allocations and Phosphor's runtime-style switch by
// looking up against a const keyword map, then memoising the name → icon
// answer for repeat hits in the same scroll session.

const _swatch = <Color>[
  Color(0xFF4FA66E),
  Color(0xFFC77F3A),
  Color(0xFFB23A48),
  Color(0xFF4D7CC1),
  Color(0xFF7E5C8A),
  Color(0xFF6FA37C),
  Color(0xFFD4884E),
  Color(0xFF528097),
];

const _accentByKeyword = <String, Color>{
  'grocer': Color(0xFF4FA66E),
  'grocery': Color(0xFF4FA66E),
  'supermarket': Color(0xFF4FA66E),
  'staples': Color(0xFF4FA66E),
  'eating': Color(0xFFC77F3A),
  'restaurant': Color(0xFFC77F3A),
  'food': Color(0xFFC77F3A),
  'cafe': Color(0xFFC77F3A),
  'transport': Color(0xFF4D7CC1),
  'uber': Color(0xFF4D7CC1),
  'fuel': Color(0xFF4D7CC1),
  'commute': Color(0xFF4D7CC1),
  'travel': Color(0xFF4D7CC1),
  'emergency': Color(0xFFB23A48),
  'health': Color(0xFFB23A48),
  'doctor': Color(0xFFB23A48),
  'medical': Color(0xFFB23A48),
  'entertainment': Color(0xFF7E5C8A),
  'movie': Color(0xFF7E5C8A),
  'subscription': Color(0xFF7E5C8A),
  'music': Color(0xFF7E5C8A),
  'phone': Color(0xFF528097),
  'internet': Color(0xFF528097),
  'mobile': Color(0xFF528097),
  'utilities': Color(0xFF528097),
  'shopping': Color(0xFFD4884E),
  'amazon': Color(0xFFD4884E),
  'flipkart': Color(0xFFD4884E),
  'salary': Color(0xFF6FA37C),
  'income': Color(0xFF6FA37C),
  'refund': Color(0xFF6FA37C),
  'cashback': Color(0xFF6FA37C),
};

final _iconByKeyword = <String, IconData>{
  'grocer': PhosphorIconsRegular.shoppingCart,
  'grocery': PhosphorIconsRegular.shoppingCart,
  'supermarket': PhosphorIconsRegular.shoppingCart,
  'food staples': PhosphorIconsRegular.shoppingCart,
  'fuel': PhosphorIconsRegular.gasPump,
  'petrol': PhosphorIconsRegular.gasPump,
  'transport': PhosphorIconsRegular.car,
  'uber': PhosphorIconsRegular.car,
  'ola': PhosphorIconsRegular.car,
  'commute': PhosphorIconsRegular.car,
  'phone': PhosphorIconsRegular.deviceMobile,
  'internet': PhosphorIconsRegular.deviceMobile,
  'mobile': PhosphorIconsRegular.deviceMobile,
  'health': PhosphorIconsRegular.firstAid,
  'doctor': PhosphorIconsRegular.firstAid,
  'medicine': PhosphorIconsRegular.firstAid,
  'medical': PhosphorIconsRegular.firstAid,
  'pharma': PhosphorIconsRegular.firstAid,
  'eating': PhosphorIconsRegular.forkKnife,
  'restaurant': PhosphorIconsRegular.forkKnife,
  'food': PhosphorIconsRegular.forkKnife,
  'cafe': PhosphorIconsRegular.forkKnife,
  'dining': PhosphorIconsRegular.forkKnife,
  'entertainment': PhosphorIconsRegular.filmStrip,
  'movie': PhosphorIconsRegular.filmStrip,
  'music': PhosphorIconsRegular.filmStrip,
  'shopping': PhosphorIconsRegular.shoppingBag,
  'amazon': PhosphorIconsRegular.shoppingBag,
  'flipkart': PhosphorIconsRegular.shoppingBag,
  'paytm': PhosphorIconsRegular.shoppingBag,
  'lifestyle': PhosphorIconsRegular.shoppingBag,
  'travel': PhosphorIconsRegular.airplaneTilt,
  'trip': PhosphorIconsRegular.airplaneTilt,
  'hotel': PhosphorIconsRegular.airplaneTilt,
  'flight': PhosphorIconsRegular.airplaneTilt,
  'rent': PhosphorIconsRegular.house,
  'home & bills': PhosphorIconsRegular.houseLine,
  'home': PhosphorIconsRegular.houseLine,
  'utilities': PhosphorIconsRegular.lightbulb,
  'electricity': PhosphorIconsRegular.lightbulb,
  'water': PhosphorIconsRegular.lightbulb,
  'gas': PhosphorIconsRegular.lightbulb,
  'insurance': PhosphorIconsRegular.shieldCheck,
  'subscription': PhosphorIconsRegular.arrowsClockwise,
  'subs': PhosphorIconsRegular.arrowsClockwise,
  'emergency': PhosphorIconsRegular.warning,
  'investment': PhosphorIconsRegular.chartLineUp,
  'mutual': PhosphorIconsRegular.chartLineUp,
  'stock': PhosphorIconsRegular.chartLineUp,
  'savings & goals': PhosphorIconsRegular.chartLineUp,
  'salary': PhosphorIconsRegular.briefcase,
  'refund': PhosphorIconsRegular.arrowUDownLeft,
  'cashback': PhosphorIconsRegular.arrowUDownLeft,
  'income': PhosphorIconsRegular.coins,
  'other income': PhosphorIconsRegular.coins,
  'family': PhosphorIconsRegular.usersThree,
  'personal care': PhosphorIconsRegular.sparkle,
  'cash withdrawal': PhosphorIconsRegular.bank,
  'daily living': PhosphorIconsRegular.basket,
  'fees & charges': PhosphorIconsRegular.receipt,
  'taxes': PhosphorIconsRegular.receipt,
  'tax': PhosphorIconsRegular.receipt,
  'donation': PhosphorIconsRegular.handHeart,
  'giving': PhosphorIconsRegular.handHeart,
  'gift': PhosphorIconsRegular.handHeart,
  'interest': PhosphorIconsRegular.percent,
  'alcohol': PhosphorIconsRegular.beerStein,
  'money': PhosphorIconsRegular.wallet,
  // Loans/EMI resolve before 'house' so "House Loan EMI" reads as a bank.
  'loan': PhosphorIconsRegular.bank,
  'emi': PhosphorIconsRegular.bank,
  'mortgage': PhosphorIconsRegular.bank,
  'maintenance': PhosphorIconsRegular.wrench,
  'repair': PhosphorIconsRegular.wrench,
  'car': PhosphorIconsRegular.car,
  'vehicle': PhosphorIconsRegular.car,
  'bike': PhosphorIconsRegular.motorcycle,
  'household': PhosphorIconsRegular.house,
  'house': PhosphorIconsRegular.house,
  'maid': PhosphorIconsRegular.broom,
  'cleaning': PhosphorIconsRegular.broom,
  'transfer': PhosphorIconsRegular.arrowsLeftRight,
  'education': PhosphorIconsRegular.graduationCap,
  'school': PhosphorIconsRegular.graduationCap,
  'tuition': PhosphorIconsRegular.graduationCap,
  'book': PhosphorIconsRegular.bookOpen,
  'gym': PhosphorIconsRegular.barbell,
  'fitness': PhosphorIconsRegular.barbell,
  'clothes': PhosphorIconsRegular.tShirt,
  'apparel': PhosphorIconsRegular.tShirt,
  'pet': PhosphorIconsRegular.pawPrint,
  'beauty': PhosphorIconsRegular.scissors,
  'salon': PhosphorIconsRegular.scissors,
  'coffee': PhosphorIconsRegular.coffee,
  'kids': PhosphorIconsRegular.baby,
  'baby': PhosphorIconsRegular.baby,
};

// Small per-process LRU-ish cache. Distinct category names in the UI are
// bounded (one per category row in the DB), so this saturates quickly.
final _iconCache = <String, IconData>{};
final _accentCache = <String, Color>{};
const _cacheCap = 64;

IconData _resolveIcon(String name) {
  final cached = _iconCache[name];
  if (cached != null) return cached;
  final n = name.toLowerCase();
  IconData? found;
  for (final entry in _iconByKeyword.entries) {
    if (n.contains(entry.key)) {
      found = entry.value;
      break;
    }
  }
  final icon = found ?? PhosphorIconsRegular.tag;
  if (_iconCache.length >= _cacheCap) _iconCache.clear();
  _iconCache[name] = icon;
  return icon;
}

Color _resolveAccent(String name) {
  final cached = _accentCache[name];
  if (cached != null) return cached;
  final n = name.toLowerCase();
  Color? found;
  for (final entry in _accentByKeyword.entries) {
    if (n.contains(entry.key)) {
      found = entry.value;
      break;
    }
  }
  Color color;
  if (found != null) {
    color = found;
  } else {
    final hash = name.codeUnits.fold<int>(
      0,
      (acc, c) => (acc * 31 + c) & 0xFFFF,
    );
    color = _swatch[hash % _swatch.length];
  }
  if (_accentCache.length >= _cacheCap) _accentCache.clear();
  _accentCache[name] = color;
  return color;
}

const _emojiByKeyword = <String, String>{
  'grocer': '🛒',
  'grocery': '🛒',
  'supermarket': '🛒',
  'food staples': '🛒',
  'transport': '🚕',
  'uber': '🚕',
  'ola': '🚕',
  'commute': '🚕',
  'fuel': '🚕',
  'phone': '📱',
  'internet': '📱',
  'mobile': '📱',
  'health': '🏥',
  'doctor': '🏥',
  'medicine': '🏥',
  'medical': '🏥',
  'eating': '🍽️',
  'restaurant': '🍽️',
  'food': '🍽️',
  'cafe': '🍽️',
  'entertainment': '🎬',
  'movie': '🎬',
  'music': '🎬',
  'shopping': '🛍️',
  'amazon': '🛍️',
  'flipkart': '🛍️',
  'paytm': '🛍️',
  'travel': '✈️',
  'trip': '✈️',
  'hotel': '✈️',
  'flight': '✈️',
  'rent': '🏠',
  'home': '🏠',
  'utilities': '💡',
  'electricity': '💡',
  'water': '💡',
  'gas': '💡',
  'insurance': '🛡️',
  'subscription': '🔁',
  'subs': '🔁',
  'emergency': '🚨',
  'investment': '📈',
  'mutual': '📈',
  'stock': '📈',
  'salary': '💼',
  'income': '💰',
  'refund': '💰',
  'cashback': '💰',
};

String _emojiFor(String n) {
  for (final entry in _emojiByKeyword.entries) {
    if (n.contains(entry.key)) return entry.value;
  }
  return '🏷️';
}
