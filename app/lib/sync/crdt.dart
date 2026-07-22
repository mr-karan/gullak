import 'dart:convert';

const int crdtSupportedSchemaVersion = 1;

/// Protocol error raised before an invalid fact can enter CRDT state.
final class CrdtValidationException implements Exception {
  const CrdtValidationException(this.message);

  final String message;

  @override
  String toString() => 'CrdtValidationException: $message';
}

/// One field assignment within an immutable causal change.
final class AssignOp {
  AssignOp({
    required this.resource,
    required this.entityId,
    required this.field,
    required Object? value,
  }) : value = _normalizeJsonValue(value, 'op.value') {
    _requireNonEmpty(resource, 'op.resource');
    _requireNonEmpty(entityId, 'op.entityId');
    _requireNonEmpty(field, 'op.field');
  }

  factory AssignOp.fromJson(Map<String, Object?> json) {
    if (json['kind'] != 'assign') {
      throw const CrdtValidationException('op.kind must be "assign"');
    }
    return AssignOp(
      resource: _requiredString(json, 'resource'),
      entityId: _requiredString(json, 'entityId'),
      field: _requiredString(json, 'field'),
      value: json['value'],
    );
  }

  final String resource;
  final String entityId;
  final String field;
  final Object? value;

  String get registerKey => '$resource\u0000$entityId\u0000$field';

  Map<String, Object?> toJson() => {
    'kind': 'assign',
    'resource': resource,
    'entityId': entityId,
    'field': field,
    'value': value,
  };
}

/// An immutable protocol-v2 user action.
final class ChangeEnvelope {
  ChangeEnvelope({
    this.protocol = 2,
    required this.epoch,
    required this.changeId,
    required this.actorId,
    required this.sequence,
    required Map<String, int> context,
    required this.lamport,
    required this.wallTimeMs,
    required this.schemaVersion,
    required List<AssignOp> ops,
  }) : context = Map.unmodifiable(Map<String, int>.from(context)),
       ops = List.unmodifiable(ops) {
    validate();
  }

  factory ChangeEnvelope.fromJson(Map<String, Object?> json) {
    final rawContext = json['context'];
    if (rawContext is! Map) {
      throw const CrdtValidationException('context must be an object');
    }
    final context = <String, int>{};
    for (final entry in rawContext.entries) {
      if (entry.key is! String || entry.value is! int) {
        throw const CrdtValidationException(
          'context keys must be strings and values must be integers',
        );
      }
      context[entry.key as String] = entry.value as int;
    }

    final rawOps = json['ops'];
    if (rawOps is! List) {
      throw const CrdtValidationException('ops must be an array');
    }
    final ops = rawOps
        .map((raw) {
          if (raw is! Map) {
            throw const CrdtValidationException('each op must be an object');
          }
          return AssignOp.fromJson(Map<String, Object?>.from(raw));
        })
        .toList(growable: false);

    return ChangeEnvelope(
      protocol: _requiredInt(json, 'protocol'),
      epoch: _requiredString(json, 'epoch'),
      changeId: _requiredString(json, 'changeId'),
      actorId: _requiredString(json, 'actorId'),
      sequence: _requiredInt(json, 'sequence'),
      context: context,
      lamport: _requiredInt(json, 'lamport'),
      wallTimeMs: _requiredInt(json, 'wallTimeMs'),
      schemaVersion: _requiredInt(json, 'schemaVersion'),
      ops: ops,
    );
  }

  final int protocol;
  final String epoch;
  final String changeId;
  final String actorId;
  final int sequence;
  final Map<String, int> context;
  final int lamport;
  final int wallTimeMs;
  final int schemaVersion;
  final List<AssignOp> ops;

  String get dot => '$actorId:$sequence';

  void validate() {
    if (protocol != 2) {
      throw const CrdtValidationException('protocol must be 2');
    }
    _requireNonEmpty(epoch, 'epoch');
    _requireNonEmpty(changeId, 'changeId');
    _requireNonEmpty(actorId, 'actorId');
    _requireSafeInteger(sequence, 'sequence', minimum: 1);
    if (changeId != dot) {
      throw CrdtValidationException('changeId must equal dot $dot');
    }
    _requireSafeInteger(lamport, 'lamport', minimum: 1);
    _requireSafeInteger(wallTimeMs, 'wallTimeMs', minimum: 0);
    _requireSafeInteger(schemaVersion, 'schemaVersion', minimum: 1);
    for (final entry in context.entries) {
      _requireNonEmpty(entry.key, 'context actorId');
      if (entry.value < 1) {
        throw const CrdtValidationException(
          'context sequences must be positive; zero entries are omitted',
        );
      }
      _requireSafeInteger(entry.value, 'context sequence', minimum: 1);
    }
    final self = context[actorId];
    if (sequence == 1 && self != null) {
      throw const CrdtValidationException(
        'sequence 1 context must omit the actor zero sequence',
      );
    }
    if (sequence > 1 && self != sequence - 1) {
      throw const CrdtValidationException(
        'context for the change actor must equal sequence - 1',
      );
    }
    if (ops.isEmpty) {
      throw const CrdtValidationException('ops must not be empty');
    }
    final targets = <String>{};
    for (final op in ops) {
      if (!targets.add(op.registerKey)) {
        throw CrdtValidationException(
          'a change cannot assign ${op.registerKey} more than once',
        );
      }
    }
  }

  Iterable<Candidate> get candidates => ops.map(
    (op) => Candidate(
      changeId: changeId,
      actorId: actorId,
      sequence: sequence,
      context: context,
      lamport: lamport,
      wallTimeMs: wallTimeMs,
      schemaVersion: schemaVersion,
      resource: op.resource,
      entityId: op.entityId,
      field: op.field,
      value: op.value,
    ),
  );

  Map<String, Object?> toJson() => {
    'protocol': protocol,
    'epoch': epoch,
    'changeId': changeId,
    'actorId': actorId,
    'sequence': sequence,
    'context': _sortedMap(context),
    'lamport': lamport,
    'wallTimeMs': wallTimeMs,
    'schemaVersion': schemaVersion,
    'ops': ops.map((op) => op.toJson()).toList(growable: false),
  };

  String canonicalJson() => encodeCanonicalJson(toJson());
}

/// A causally annotated value in one field register.
final class Candidate {
  Candidate({
    required this.changeId,
    required this.actorId,
    required this.sequence,
    required Map<String, int> context,
    required this.lamport,
    required this.wallTimeMs,
    required this.schemaVersion,
    required this.resource,
    required this.entityId,
    required this.field,
    required Object? value,
  }) : context = Map.unmodifiable(Map<String, int>.from(context)),
       value = _normalizeJsonValue(value, 'candidate.value') {
    _requireNonEmpty(changeId, 'candidate.changeId');
    _requireNonEmpty(actorId, 'candidate.actorId');
    _requireNonEmpty(resource, 'candidate.resource');
    _requireNonEmpty(entityId, 'candidate.entityId');
    _requireNonEmpty(field, 'candidate.field');
    _requireSafeInteger(sequence, 'candidate.sequence', minimum: 1);
    _requireSafeInteger(lamport, 'candidate.lamport', minimum: 1);
    _requireSafeInteger(wallTimeMs, 'candidate.wallTimeMs', minimum: 0);
    _requireSafeInteger(schemaVersion, 'candidate.schemaVersion', minimum: 1);
    if (changeId != dot) {
      throw CrdtValidationException('candidate changeId must equal dot $dot');
    }
    for (final entry in this.context.entries) {
      _requireNonEmpty(entry.key, 'candidate context actorId');
      if (entry.value < 1) {
        throw const CrdtValidationException(
          'candidate context sequences must be positive; zero entries are omitted',
        );
      }
      _requireSafeInteger(
        entry.value,
        'candidate context sequence',
        minimum: 1,
      );
    }
    final self = this.context[actorId];
    if (sequence == 1 && self != null) {
      throw const CrdtValidationException(
        'sequence 1 candidate context must omit the actor zero sequence',
      );
    }
    if (sequence > 1 && self != sequence - 1) {
      throw const CrdtValidationException(
        'candidate context for its actor must equal sequence - 1',
      );
    }
  }

  factory Candidate.fromJson(Map<String, Object?> json) {
    final rawContext = json['context'];
    if (rawContext is! Map) {
      throw const CrdtValidationException(
        'candidate context must be an object',
      );
    }
    final context = <String, int>{};
    for (final entry in rawContext.entries) {
      if (entry.key is! String || entry.value is! int) {
        throw const CrdtValidationException(
          'candidate context must map strings to integers',
        );
      }
      context[entry.key as String] = entry.value as int;
    }
    return Candidate(
      changeId: _requiredString(json, 'changeId'),
      actorId: _requiredString(json, 'actorId'),
      sequence: _requiredInt(json, 'sequence'),
      context: context,
      lamport: _requiredInt(json, 'lamport'),
      wallTimeMs: _requiredInt(json, 'wallTimeMs'),
      schemaVersion: _requiredInt(json, 'schemaVersion'),
      resource: _requiredString(json, 'resource'),
      entityId: _requiredString(json, 'entityId'),
      field: _requiredString(json, 'field'),
      value: json['value'],
    );
  }

  /// Decodes the compact, cross-runtime candidate stored inside a register.
  ///
  /// Register JSON deliberately omits target and audit metadata: the target is
  /// the containing `sync_registers` row, while the immutable change remains
  /// the source of audit metadata. Callers therefore supply that row identity.
  factory Candidate.fromRegisterJson(
    Map<String, Object?> json, {
    required String resource,
    required String entityId,
    required String field,
  }) {
    final rawDot = json['dot'];
    if (rawDot is! Map) {
      throw const CrdtValidationException('candidate.dot must be an object');
    }
    final dot = Map<String, Object?>.from(rawDot);
    final actorId = _requiredString(dot, 'actorId');
    final sequence = _requiredInt(dot, 'sequence');

    final rawContext = json['context'];
    if (rawContext is! Map) {
      throw const CrdtValidationException(
        'candidate context must be an object',
      );
    }
    final context = <String, int>{};
    for (final entry in rawContext.entries) {
      if (entry.key is! String || entry.value is! int) {
        throw const CrdtValidationException(
          'candidate context must map strings to integers',
        );
      }
      context[entry.key as String] = entry.value as int;
    }

    return Candidate(
      changeId: '$actorId:$sequence',
      actorId: actorId,
      sequence: sequence,
      context: context,
      lamport: _requiredInt(json, 'lamport'),
      // These values are not part of canonical register state and never
      // participate in merge or projection.
      wallTimeMs: 0,
      schemaVersion: 1,
      resource: resource,
      entityId: entityId,
      field: field,
      value: json['value'],
    );
  }

  final String changeId;
  final String actorId;
  final int sequence;
  final Map<String, int> context;
  final int lamport;
  final int wallTimeMs;
  final int schemaVersion;
  final String resource;
  final String entityId;
  final String field;
  final Object? value;

  String get dot => '$actorId:$sequence';
  String get registerKey => '$resource\u0000$entityId\u0000$field';

  /// Whether this candidate was authored after observing [other].
  bool causallyDominates(Candidate other) =>
      (context[other.actorId] ?? 0) >= other.sequence;

  Map<String, Object?> toJson() => {
    'changeId': changeId,
    'actorId': actorId,
    'sequence': sequence,
    'context': _sortedMap(context),
    'lamport': lamport,
    'wallTimeMs': wallTimeMs,
    'schemaVersion': schemaVersion,
    'resource': resource,
    'entityId': entityId,
    'field': field,
    'value': value,
  };

  String canonicalJson() => encodeCanonicalJson(toJson());

  /// Canonical representation inside a register. The containing register and
  /// immutable change retain target and audit metadata separately.
  Map<String, Object?> toRegisterJson() => {
    'dot': {'actorId': actorId, 'sequence': sequence},
    'context': _sortedMap(context),
    'lamport': lamport,
    'value': value,
  };
}

/// The causally maximal antichain for a single entity field.
final class RegisterState {
  RegisterState([Iterable<Candidate> candidates = const []])
    : candidates = List.unmodifiable(_normalize(candidates));

  factory RegisterState.fromJson(
    Map<String, Object?> json, {
    required String resource,
    required String entityId,
    required String field,
  }) {
    final raw = json['candidates'];
    if (raw is! List) {
      throw const CrdtValidationException('candidates must be an array');
    }
    return RegisterState(
      raw.map((entry) {
        if (entry is! Map) {
          throw const CrdtValidationException('candidate must be an object');
        }
        return Candidate.fromRegisterJson(
          Map<String, Object?>.from(entry),
          resource: resource,
          entityId: entityId,
          field: field,
        );
      }),
    );
  }

  final List<Candidate> candidates;

  bool get isEmpty => candidates.isEmpty;
  bool get hasConflict => candidates.length > 1;
  int get conflictCount => candidates.isEmpty ? 0 : candidates.length - 1;

  /// The deterministic relational projection. Concurrent candidates remain
  /// present in [candidates]; this getter is not a destructive LWW merge.
  Candidate? get visibleWinner {
    if (candidates.isEmpty) return null;
    return candidates.reduce(
      (left, right) => _compareWinner(left, right) >= 0 ? left : right,
    );
  }

  ConflictReport get conflict => ConflictReport(
    hasConflict: hasConflict,
    winner: visibleWinner,
    candidates: candidates,
  );

  RegisterState add(Candidate candidate) =>
      RegisterState(<Candidate>[...candidates, candidate]);

  RegisterState merge(RegisterState other) =>
      RegisterState(<Candidate>[...candidates, ...other.candidates]);

  Map<String, Object?> toJson() => {
    'candidates': candidates
        .map((candidate) => candidate.toRegisterJson())
        .toList(),
  };

  String canonicalJson() => encodeCanonicalJson(toJson());

  static List<Candidate> _normalize(Iterable<Candidate> input) {
    final byDot = <String, Candidate>{};
    String? registerKey;
    for (final candidate in input) {
      registerKey ??= candidate.registerKey;
      if (candidate.registerKey != registerKey) {
        throw const CrdtValidationException(
          'a register cannot contain candidates for different fields',
        );
      }
      final existing = byDot[candidate.dot];
      if (existing != null &&
          encodeCanonicalJson(existing.toRegisterJson()) !=
              encodeCanonicalJson(candidate.toRegisterJson())) {
        throw CrdtValidationException(
          'dot ${candidate.dot} was reused with different candidate bytes',
        );
      }
      byDot[candidate.dot] = candidate;
    }

    final all = byDot.values.toList(growable: false);
    final candidatesByDot = {
      for (final candidate in all) candidate.dot: candidate,
    };
    final visiting = <String>{};
    final visited = <String>{};
    void visit(Candidate candidate) {
      if (visiting.contains(candidate.dot)) {
        throw const CrdtValidationException(
          'candidate contexts cannot contain a causal cycle',
        );
      }
      if (visited.contains(candidate.dot)) return;
      visiting.add(candidate.dot);
      for (final dependency in all) {
        if (!candidate.causallyDominates(dependency)) continue;
        final known = candidatesByDot[dependency.dot];
        if (known != null) visit(known);
      }
      visiting.remove(candidate.dot);
      visited.add(candidate.dot);
    }

    for (final candidate in all) {
      visit(candidate);
    }
    final maximal = all
        .where(
          (candidate) => !all.any(
            (other) =>
                other.dot != candidate.dot &&
                other.causallyDominates(candidate),
          ),
        )
        .toList();
    maximal.sort(_compareCanonicalCandidate);
    return maximal;
  }
}

final class ConflictReport {
  const ConflictReport({
    required this.hasConflict,
    required this.winner,
    required this.candidates,
  });

  final bool hasConflict;
  final Candidate? winner;
  final List<Candidate> candidates;
}

/// Financial/domain row lifecycle: a concurrent remove hides the row.
bool removeWinsExistence(RegisterState state, {bool defaultValue = false}) {
  if (state.isEmpty) return defaultValue;
  final values = _booleanCandidates(state);
  return !values.contains(false);
}

/// Set membership: a concurrent unseen add survives a remove.
bool addWinsMembership(RegisterState state, {bool defaultValue = false}) {
  if (state.isEmpty) return defaultValue;
  return _booleanCandidates(state).contains(true);
}

Set<bool> _booleanCandidates(RegisterState state) => state.candidates.map((c) {
  final value = c.value;
  if (value is! bool) {
    throw CrdtValidationException(
      '${c.registerKey} must contain boolean lifecycle candidates',
    );
  }
  return value;
}).toSet();

int _compareWinner(Candidate left, Candidate right) {
  var comparison = left.lamport.compareTo(right.lamport);
  if (comparison != 0) return comparison;
  comparison = left.actorId.compareTo(right.actorId);
  if (comparison != 0) return comparison;
  return left.sequence.compareTo(right.sequence);
}

int _compareCanonicalCandidate(Candidate left, Candidate right) {
  var comparison = left.actorId.compareTo(right.actorId);
  if (comparison != 0) return comparison;
  comparison = left.sequence.compareTo(right.sequence);
  if (comparison != 0) return comparison;
  return left.canonicalJson().compareTo(right.canonicalJson());
}

String encodeCanonicalJson(Object? value) => jsonEncode(_canonicalize(value));

Object? _canonicalize(Object? value) {
  if (value is Map) {
    final keys = value.keys.map((key) {
      if (key is! String) {
        throw const CrdtValidationException('JSON object keys must be strings');
      }
      return key;
    }).toList()..sort();
    return <String, Object?>{
      for (final key in keys) key: _canonicalize(value[key]),
    };
  }
  if (value is List) return value.map(_canonicalize).toList(growable: false);
  return _normalizeJsonValue(value, 'JSON value');
}

Map<String, V> _sortedMap<V>(Map<String, V> input) {
  final keys = input.keys.toList()..sort();
  return <String, V>{for (final key in keys) key: input[key] as V};
}

Object? _normalizeJsonValue(Object? value, String path) {
  if (value == null || value is String || value is bool) return value;
  if (value is int) {
    if (value < -_maxSafeInteger || value > _maxSafeInteger) {
      throw CrdtValidationException('$path integers must be safe integers');
    }
    return value;
  }
  if (value is double) {
    if (!value.isFinite) {
      throw CrdtValidationException('$path must not contain NaN or infinity');
    }
    if (value == 0) return 0;
    if (value.truncateToDouble() == value && value.abs() <= _maxSafeInteger) {
      return value.toInt();
    }
    // Protocol v2 has only one fractional domain: geographic coordinates.
    // Requiring a 1e-7 degree grid (roughly 1 cm) makes canonical bytes and
    // hashes independent of JavaScript/Dart formatting. Never round here: an
    // immutable authored value must either be valid or fail.
    if (value.abs() <= _portableDecimalLimit) {
      final scaled = (value * _portableDecimalScale + 0.5).floor();
      final normalized = scaled / _portableDecimalScale;
      if (normalized == value) return normalized;
    }
    throw CrdtValidationException(
      '$path numbers must be safe integers or portable decimals within '
      '[-$_portableDecimalLimit, $_portableDecimalLimit]',
    );
  }
  if (value is List) {
    return [
      for (var index = 0; index < value.length; index++)
        _normalizeJsonValue(value[index], '$path[$index]'),
    ];
  }
  if (value is Map) {
    final result = <String, Object?>{};
    for (final entry in value.entries) {
      if (entry.key is! String) {
        throw CrdtValidationException('$path object keys must be strings');
      }
      result[entry.key as String] = _normalizeJsonValue(
        entry.value,
        '$path.${entry.key}',
      );
    }
    return result;
  }
  throw CrdtValidationException('$path is not a JSON value');
}

String _requiredString(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! String || value.isEmpty) {
    throw CrdtValidationException('$key must be a non-empty string');
  }
  return value;
}

int _requiredInt(Map<String, Object?> json, String key) {
  final value = json[key];
  if (value is! int) {
    throw CrdtValidationException('$key must be an integer');
  }
  return value;
}

const int _maxSafeInteger = 9007199254740991;
const double _portableDecimalLimit = 180;
const int _portableDecimalScale = 10000000;

void _requireSafeInteger(int value, String name, {required int minimum}) {
  if (value < minimum || value > _maxSafeInteger) {
    throw CrdtValidationException('$name must be a safe integer >= $minimum');
  }
}

void _requireNonEmpty(String value, String name) {
  if (value.isEmpty) {
    throw CrdtValidationException('$name must be non-empty');
  }
}
