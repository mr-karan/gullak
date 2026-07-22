import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:gullak/sync/crdt.dart';

void main() {
  final vectors =
      jsonDecode(File('../sync_test_vectors/crdt_v1.json').readAsStringSync())
          as Map<String, dynamic>;

  group('shared canonical vectors', () {
    test('vector format is the frozen v1 corpus', () {
      expect(vectors['format'], 'gullak-crdt-v1');
    });

    for (final raw in vectors['registerCases'] as List<dynamic>) {
      final vector = raw as Map<String, dynamic>;
      test(vector['name'] as String, () {
        final state = _vectorState(
          vector['changes'] as List<dynamic>,
          target: vector['target'] as Map<String, dynamic>,
        );
        expect(state.canonicalJson(), vector['expectedStateJson']);
        expect(
          encodeCanonicalJson(state.visibleWinner?.value),
          encodeCanonicalJson(vector['expectedValue']),
        );
        expect(state.conflictCount, vector['expectedConflictCount']);
      });
    }

    for (final raw in vectors['lifecycleCases'] as List<dynamic>) {
      final vector = raw as Map<String, dynamic>;
      test('lifecycle: ${vector['name']}', () {
        expect(
          removeWinsExistence(_vectorState(vector['changes'] as List<dynamic>)),
          vector['expected'],
        );
      });
    }

    for (final raw in vectors['membershipCases'] as List<dynamic>) {
      final vector = raw as Map<String, dynamic>;
      test('membership: ${vector['name']}', () {
        expect(
          addWinsMembership(_vectorState(vector['changes'] as List<dynamic>)),
          vector['expected'],
        );
      });
    }
  });

  group('causal MVR algebra', () {
    test('merge is commutative, associative and idempotent', () {
      final a = _candidate(actor: 'a', sequence: 1, lamport: 1, value: 'A');
      final b = _candidate(actor: 'b', sequence: 1, lamport: 2, value: 'B');
      final c = _candidate(actor: 'c', sequence: 1, lamport: 3, value: 'C');
      final left = RegisterState([a]);
      final right = RegisterState([b]);
      final third = RegisterState([c]);

      expect(
        left.merge(right).canonicalJson(),
        right.merge(left).canonicalJson(),
      );
      expect(
        left.merge(right).merge(third).canonicalJson(),
        left.merge(right.merge(third)).canonicalJson(),
      );
      expect(left.merge(left).canonicalJson(), left.canonicalJson());
    });

    test('all permutations and duplicates converge', () {
      final candidates = [
        _candidate(actor: 'a', sequence: 1, lamport: 1, value: 'A'),
        _candidate(actor: 'b', sequence: 1, lamport: 4, value: 'B'),
        _candidate(
          actor: 'a',
          sequence: 2,
          context: const {'a': 1, 'b': 1},
          lamport: 5,
          value: 'resolved',
        ),
      ];
      final expected = RegisterState(candidates).canonicalJson();
      for (final permutation in _permutations(candidates)) {
        var state = RegisterState();
        for (final candidate in [...permutation, ...permutation]) {
          state = state.add(candidate);
        }
        expect(state.canonicalJson(), expected);
      }
    });

    test('causal successor removes every observed candidate', () {
      final a = _candidate(actor: 'a', sequence: 1, lamport: 10, value: 'A');
      final b = _candidate(actor: 'b', sequence: 1, lamport: 20, value: 'B');
      final resolution = _candidate(
        actor: 'a',
        sequence: 2,
        context: const {'a': 1, 'b': 1},
        lamport: 21,
        value: 'resolved',
      );

      final state = RegisterState([resolution, b, a]);
      expect(state.candidates, hasLength(1));
      expect(state.visibleWinner?.value, 'resolved');
      expect(state.hasConflict, isFalse);
    });

    test('concurrent values remain while winner is deterministic', () {
      final a = _candidate(
        actor: 'a',
        sequence: 7,
        context: const {'a': 6},
        lamport: 11,
        value: 'A',
      );
      final b = _candidate(
        actor: 'b',
        sequence: 2,
        context: const {'b': 1},
        lamport: 11,
        value: 'B',
      );
      final state = RegisterState([b, a]);

      expect(state.hasConflict, isTrue);
      expect(state.conflict.candidates, hasLength(2));
      expect(state.visibleWinner?.value, 'B');
      expect(state.conflict.winner?.actorId, 'b');
    });

    test('wall clock is ignored by causal merge and visible winner', () {
      final future = _candidate(
        actor: 'a',
        sequence: 1,
        lamport: 1,
        wallTimeMs: 9000000000000,
        value: 'future clock',
      );
      final past = _candidate(
        actor: 'b',
        sequence: 1,
        lamport: 2,
        wallTimeMs: 0,
        value: 'past clock',
      );

      expect(RegisterState([future, past]).visibleWinner?.value, 'past clock');
    });
  });

  group('lifecycle and membership policies', () {
    test('remove wins concurrent lifecycle assignments', () {
      final add = _candidate(field: r'$exists', actor: 'a', value: true);
      final remove = _candidate(field: r'$exists', actor: 'b', value: false);
      expect(removeWinsExistence(RegisterState([add, remove])), isFalse);
    });

    test('causal restore supersedes remove', () {
      final remove = _candidate(field: r'$exists', actor: 'a', value: false);
      final restore = _candidate(
        field: r'$exists',
        actor: 'b',
        context: const {'a': 1},
        lamport: 2,
        value: true,
      );
      expect(removeWinsExistence(RegisterState([restore, remove])), isTrue);
    });

    test('add wins concurrent membership but observed remove wins later', () {
      final add = _candidate(field: r'$exists', actor: 'a', value: true);
      final concurrentRemove = _candidate(
        field: r'$exists',
        actor: 'b',
        value: false,
      );
      expect(addWinsMembership(RegisterState([add, concurrentRemove])), isTrue);

      final observedRemove = _candidate(
        field: r'$exists',
        actor: 'b',
        sequence: 2,
        context: const {'a': 1, 'b': 1},
        lamport: 2,
        value: false,
      );
      expect(
        addWinsMembership(
          RegisterState([add, concurrentRemove, observedRemove]),
        ),
        isFalse,
      );
    });
  });

  group('wire validation and canonicalization', () {
    test('round trips null and unknown fields opaquely', () {
      final envelope = ChangeEnvelope(
        epoch: 'epoch',
        changeId: 'phone:1',
        actorId: 'phone',
        sequence: 1,
        context: const {},
        lamport: 1,
        wallTimeMs: 123,
        schemaVersion: 99,
        ops: [
          AssignOp(
            resource: 'transactions',
            entityId: 'txn',
            field: 'future.metadata',
            value: const {
              'nullable': null,
              'nested': [1, true, 'x'],
            },
          ),
        ],
      );

      final decoded = ChangeEnvelope.fromJson(
        Map<String, Object?>.from(jsonDecode(envelope.canonicalJson()) as Map),
      );
      expect(decoded.canonicalJson(), envelope.canonicalJson());
      expect(decoded.candidates.single.value, envelope.ops.single.value);
    });

    test('canonical register JSON has stable candidate and map ordering', () {
      final a = _candidate(actor: 'z', value: const {'z': 1, 'a': 2});
      final b = _candidate(actor: 'a', value: null);
      final canonical = RegisterState([a, b]).canonicalJson();
      expect(canonical, RegisterState([b, a]).canonicalJson());

      final decoded = RegisterState.fromJson(
        Map<String, Object?>.from(jsonDecode(canonical) as Map),
        resource: 'transactions',
        entityId: 'txn',
        field: 'notes',
      );
      expect(decoded.canonicalJson(), canonical);
      expect(decoded.visibleWinner?.value, const {'z': 1, 'a': 2});
    });

    test('rejects malformed envelopes and dot reuse with different bytes', () {
      expect(
        () => ChangeEnvelope(
          epoch: 'epoch',
          changeId: 'wrong',
          actorId: 'phone',
          sequence: 1,
          context: const {},
          lamport: 1,
          wallTimeMs: 0,
          schemaVersion: 1,
          ops: [AssignOp(resource: 'r', entityId: 'e', field: 'f', value: 1)],
        ),
        throwsA(isA<CrdtValidationException>()),
      );

      final first = _candidate(actor: 'a', value: 1);
      final reused = _candidate(actor: 'a', value: 2);
      expect(
        () => RegisterState([first, reused]),
        throwsA(isA<CrdtValidationException>()),
      );
    });

    test('rejects zero/gapped self contexts and causal cycles', () {
      expect(
        () => _candidate(actor: 'a', sequence: 2, context: const {'a': 0}),
        throwsA(isA<CrdtValidationException>()),
      );
      expect(
        () => _candidate(actor: 'a', sequence: 3, context: const {'a': 1}),
        throwsA(isA<CrdtValidationException>()),
      );

      final a = _candidate(actor: 'a', context: const {'b': 1});
      final b = _candidate(actor: 'b', context: const {'a': 1});
      expect(
        () => RegisterState([a, b]),
        throwsA(isA<CrdtValidationException>()),
      );
    });

    test('rejects causal cycles of three or more candidates', () {
      final a = _candidate(actor: 'a', context: const {'b': 1});
      final b = _candidate(actor: 'b', context: const {'c': 1});
      final c = _candidate(actor: 'c', context: const {'a': 1});
      expect(
        () => RegisterState([a, b, c]),
        throwsA(isA<CrdtValidationException>()),
      );
    });

    test('numeric JSON is safe and cross-runtime canonical', () {
      expect(
        () => AssignOp(
          resource: 'r',
          entityId: 'e',
          field: 'f',
          value: 9007199254740992,
        ),
        throwsA(isA<CrdtValidationException>()),
      );
      expect(
        () => encodeCanonicalJson(181.25),
        throwsA(isA<CrdtValidationException>()),
      );
      expect(
        () => encodeCanonicalJson(12.971598765),
        throwsA(isA<CrdtValidationException>()),
      );
      expect(
        encodeCanonicalJson({'lat': 12.9715987, 'lng': -77.5945623}),
        '{"lat":12.9715987,"lng":-77.5945623}',
      );
      expect(encodeCanonicalJson(-0.0), '0');
    });
  });
}

RegisterState _vectorState(
  List<dynamic> changes, {
  Map<String, dynamic>? target,
}) {
  var state = RegisterState();
  for (final raw in changes) {
    final envelope = ChangeEnvelope.fromJson(
      Map<String, Object?>.from(raw as Map),
    );
    final op = target == null
        ? envelope.ops.first
        : envelope.ops.singleWhere(
            (candidate) =>
                candidate.resource == target['resource'] &&
                candidate.entityId == target['entityId'] &&
                candidate.field == target['field'],
          );
    final candidate = envelope.candidates.singleWhere(
      (candidate) =>
          candidate.resource == op.resource &&
          candidate.entityId == op.entityId &&
          candidate.field == op.field,
    );
    state = state.add(candidate);
  }
  return state;
}

Candidate _candidate({
  String resource = 'transactions',
  String entityId = 'txn',
  String field = 'notes',
  required String actor,
  int sequence = 1,
  Map<String, int> context = const {},
  int lamport = 1,
  int wallTimeMs = 0,
  Object? value,
}) => Candidate(
  changeId: '$actor:$sequence',
  actorId: actor,
  sequence: sequence,
  context: context,
  lamport: lamport,
  wallTimeMs: wallTimeMs,
  schemaVersion: 1,
  resource: resource,
  entityId: entityId,
  field: field,
  value: value,
);

Iterable<List<T>> _permutations<T>(List<T> values) sync* {
  if (values.length < 2) {
    yield List<T>.from(values);
    return;
  }
  for (var index = 0; index < values.length; index++) {
    final head = values[index];
    final tail = List<T>.from(values)..removeAt(index);
    for (final permutation in _permutations(tail)) {
      yield [head, ...permutation];
    }
  }
}
