/// Replaceable clock for tests.
class Clock {
  const Clock();

  DateTime now() => DateTime.now();
  DateTime today() {
    final n = now();
    return DateTime(n.year, n.month, n.day);
  }
}

const Clock clock = Clock();
