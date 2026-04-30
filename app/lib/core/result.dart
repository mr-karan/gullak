/// Minimal Result type for boundary errors.
///
/// We do not over-use this — domain code throws; data-layer boundaries
/// (HTTP, DB) wrap into [Result] when callers need to handle failure
/// inline (e.g. to render an error banner).
sealed class Result<T> {
  const Result();

  bool get isOk => this is Ok<T>;
  bool get isErr => this is Err<T>;

  T? get valueOrNull => switch (this) {
        Ok<T>(:final value) => value,
        Err<T>() => null,
      };

  R fold<R>(R Function(T value) ok, R Function(Object error, StackTrace? st) err) {
    return switch (this) {
      Ok<T>(:final value) => ok(value),
      Err<T>(:final error, :final stackTrace) => err(error, stackTrace),
    };
  }
}

class Ok<T> extends Result<T> {
  const Ok(this.value);
  final T value;
}

class Err<T> extends Result<T> {
  const Err(this.error, [this.stackTrace]);
  final Object error;
  final StackTrace? stackTrace;
}

extension ResultExt<T> on Future<T> Function() {
  Future<Result<T>> safe() async {
    try {
      return Ok(await this());
    } catch (e, st) {
      return Err(e, st);
    }
  }
}
