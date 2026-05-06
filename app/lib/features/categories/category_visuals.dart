String categoryEmoji(String? icon, String name) {
  final explicit = icon?.trim();
  if (explicit != null && explicit.isNotEmpty) return explicit;

  final n = name.toLowerCase();
  if (_has(n, ['grocer', 'grocery', 'supermarket', 'food staples'])) {
    return '🛒';
  }
  if (_has(n, ['transport', 'uber', 'ola', 'commute', 'fuel'])) return '🚕';
  if (_has(n, ['phone', 'internet', 'mobile'])) return '📱';
  if (_has(n, ['health', 'doctor', 'medicine', 'medical'])) return '🏥';
  if (_has(n, ['eating', 'restaurant', 'food', 'cafe'])) return '🍽️';
  if (_has(n, ['entertainment', 'movie', 'music'])) return '🎬';
  if (_has(n, ['shopping', 'amazon', 'flipkart', 'paytm'])) return '🛍️';
  if (_has(n, ['travel', 'trip', 'hotel', 'flight'])) return '✈️';
  if (_has(n, ['rent', 'home'])) return '🏠';
  if (_has(n, ['utilities', 'electricity', 'water', 'gas'])) return '💡';
  if (_has(n, ['insurance'])) return '🛡️';
  if (_has(n, ['subscription', 'subs'])) return '🔁';
  if (_has(n, ['emergency'])) return '🚨';
  if (_has(n, ['investment', 'mutual', 'stock'])) return '📈';
  if (_has(n, ['salary'])) return '💼';
  if (_has(n, ['income', 'refund', 'cashback'])) return '💰';
  return '🏷️';
}

String defaultCategoryEmoji(String name) => categoryEmoji(null, name);

bool _has(String text, List<String> needles) =>
    needles.any((needle) => text.contains(needle));
