import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import {
  type AssignOp,
  type Candidate,
  type ChangeEnvelope,
  type JsonValue,
  type RegisterState,
  CrdtValidationError,
  candidateFor,
  canonicalChangeJson,
  canonicalRegisterJson,
  compareCandidates,
  foldRegisterCandidates,
  mergeCandidate,
  mergeRegisterStates,
  normalizeRegisterState,
  projectAddWinsMembership,
  projectRegister,
  projectRemoveWinsExists,
  stableJson,
  validateChangeEnvelope,
} from "./crdt.ts";

type Target = Pick<AssignOp, "resource" | "entityId" | "field">;

type RegisterVector = {
  name: string;
  target: Target;
  changes: unknown[];
  expectedStateJson: string;
  expectedValue: JsonValue;
  expectedConflictCount: number;
};

type BooleanVector = {
  name: string;
  changes: unknown[];
  expected: boolean;
};

type Vectors = {
  format: string;
  registerCases: RegisterVector[];
  lifecycleCases: BooleanVector[];
  membershipCases: BooleanVector[];
};

const vectors = JSON.parse(
  readFileSync(
    new URL("../../../sync_test_vectors/crdt_v1.json", import.meta.url),
    "utf8",
  ),
) as Vectors;

function matchingCandidate(changeValue: unknown, target?: Target): Candidate {
  const change = validateChangeEnvelope(changeValue);
  const op =
    target === undefined
      ? change.ops[0]
      : change.ops.find(
          (item) =>
            item.resource === target.resource &&
            item.entityId === target.entityId &&
            item.field === target.field,
        );
  if (op === undefined) throw new Error("test vector has no matching op");
  return candidateFor(change, op);
}

function vectorState(changes: unknown[], target?: Target): RegisterState {
  return foldRegisterCandidates(
    changes.map((change) => matchingCandidate(change, target)),
  );
}

function permutations<T>(items: T[]): T[][] {
  if (items.length < 2) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(
      (rest) => [item, ...rest],
    ),
  );
}

describe("shared canonical vectors", () => {
  test("vector format is the frozen v1 corpus", () => {
    expect(vectors.format).toBe("gullak-crdt-v1");
  });

  for (const vector of vectors.registerCases) {
    test(vector.name, () => {
      const state = vectorState(vector.changes, vector.target);
      const projection = projectRegister(state);

      expect(canonicalRegisterJson(state)).toBe(vector.expectedStateJson);
      expect(stableJson(projection.value)).toBe(
        stableJson(vector.expectedValue),
      );
      expect(projection.conflict?.alternatives.length ?? 0).toBe(
        vector.expectedConflictCount,
      );
    });
  }

  for (const vector of vectors.lifecycleCases) {
    test(`lifecycle: ${vector.name}`, () => {
      expect(projectRemoveWinsExists(vectorState(vector.changes))).toBe(
        vector.expected,
      );
    });
  }

  for (const vector of vectors.membershipCases) {
    test(`membership: ${vector.name}`, () => {
      expect(projectAddWinsMembership(vectorState(vector.changes))).toBe(
        vector.expected,
      );
    });
  }
});

describe("register merge laws", () => {
  const a: Candidate = {
    dot: { actorId: "a", sequence: 1 },
    context: {},
    lamport: 1,
    value: "a1",
  };
  const b: Candidate = {
    dot: { actorId: "b", sequence: 1 },
    context: {},
    lamport: 2,
    value: "b1",
  };
  const c: Candidate = {
    dot: { actorId: "c", sequence: 1 },
    context: { a: 1, b: 1 },
    lamport: 3,
    value: "c1",
  };
  const state = (candidate: Candidate): RegisterState => ({
    candidates: [candidate],
  });

  test("merge is commutative", () => {
    expect(canonicalRegisterJson(mergeRegisterStates(state(a), state(b)))).toBe(
      canonicalRegisterJson(mergeRegisterStates(state(b), state(a))),
    );
  });

  test("merge is associative", () => {
    const left = mergeRegisterStates(
      mergeRegisterStates(state(a), state(b)),
      state(c),
    );
    const right = mergeRegisterStates(
      state(a),
      mergeRegisterStates(state(b), state(c)),
    );
    expect(canonicalRegisterJson(left)).toBe(canonicalRegisterJson(right));
  });

  test("merge is idempotent", () => {
    const once = mergeRegisterStates(state(a), state(b));
    expect(canonicalRegisterJson(mergeRegisterStates(once, once))).toBe(
      canonicalRegisterJson(once),
    );
  });

  test("every permutation and duplicate delivery has identical state", () => {
    const expected = canonicalRegisterJson(foldRegisterCandidates([a, b, c]));
    for (const order of permutations([a, b, c])) {
      expect(canonicalRegisterJson(foldRegisterCandidates(order))).toBe(
        expected,
      );
      expect(
        canonicalRegisterJson(
          foldRegisterCandidates([order[0] as Candidate, ...order]),
        ),
      ).toBe(expected);
    }
  });
});

describe("causal and projection semantics", () => {
  test("a causal successor removes the predecessor from the antichain", () => {
    const old: Candidate = {
      dot: { actorId: "phone", sequence: 1 },
      context: {},
      lamport: 100,
      value: "old",
    };
    const next: Candidate = {
      dot: { actorId: "server", sequence: 1 },
      context: { phone: 1 },
      lamport: 101,
      value: "new",
    };
    const state = foldRegisterCandidates([next, old]);
    expect(state.candidates).toHaveLength(1);
    expect(projectRegister(state).value).toBe("new");
  });

  test("concurrent same-field assignments are retained and reported", () => {
    const vector = vectors.registerCases.find((item) =>
      item.name.startsWith("concurrent values"),
    );
    if (vector === undefined) throw new Error("missing conflict vector");
    const projection = projectRegister(
      vectorState(vector.changes, vector.target),
    );
    expect(projection.winner?.dot.actorId).toBe("web");
    expect(projection.conflict?.alternatives).toHaveLength(1);
    expect(projection.conflict?.alternatives[0]?.value).toBe("phone note");
  });

  test("wall time has no effect on a candidate or visible winner", () => {
    const vector = vectors.registerCases.find((item) =>
      item.name.startsWith("concurrent values"),
    );
    if (vector === undefined) throw new Error("missing clock vector");
    const changes = vector.changes.map((item) => structuredClone(item));
    const first = changes[0] as Record<string, unknown>;
    const second = changes[1] as Record<string, unknown>;
    first.wallTimeMs = 0;
    second.wallTimeMs = 8_000_000_000_000;

    const before = vectorState(vector.changes, vector.target);
    const after = vectorState(changes, vector.target);
    expect(canonicalRegisterJson(after)).toBe(canonicalRegisterJson(before));
    expect(projectRegister(after).value).toBe("web note");
  });

  test("winner tuple is lamport, actorId, then sequence", () => {
    const base: Candidate = {
      dot: { actorId: "a", sequence: 9 },
      context: { a: 8 },
      lamport: 3,
      value: null,
    };
    expect(
      compareCandidates(base, {
        ...base,
        dot: { actorId: "z", sequence: 1 },
        context: {},
      }),
    ).toBeLessThan(0);
    expect(
      compareCandidates(base, {
        ...base,
        dot: { actorId: "a", sequence: 10 },
        context: { a: 9 },
      }),
    ).toBeLessThan(0);
    expect(compareCandidates(base, { ...base, lamport: 4 })).toBeLessThan(0);
  });

  test("non-boolean lifecycle and membership candidates fail closed", () => {
    const state: RegisterState = {
      candidates: [
        {
          dot: { actorId: "phone", sequence: 1 },
          context: {},
          lamport: 1,
          value: "yes",
        },
      ],
    };
    expect(() => projectRemoveWinsExists(state)).toThrow(CrdtValidationError);
    expect(() => projectAddWinsMembership(state)).toThrow(CrdtValidationError);
  });
});

describe("validation and canonical encoding", () => {
  const valid = (): ChangeEnvelope => ({
    protocol: 2,
    epoch: "epoch",
    changeId: "phone:2",
    actorId: "phone",
    sequence: 2,
    context: { phone: 1 },
    lamport: 2,
    wallTimeMs: 1,
    schemaVersion: 1,
    ops: [
      {
        kind: "assign",
        resource: "transactions",
        entityId: "t1",
        field: "notes",
        value: null,
      },
    ],
  });

  test("dot identity, self context, and JSON values are validated", () => {
    expect(() =>
      validateChangeEnvelope({ ...valid(), changeId: "phone:9" }),
    ).toThrow(/actorId:sequence/);
    expect(() =>
      validateChangeEnvelope({ ...valid(), context: { phone: 2 } }),
    ).toThrow(/sequence - 1/);
    expect(() =>
      validateChangeEnvelope({ ...valid(), context: { phone: 1, web: 0 } }),
    ).toThrow(/safe integer/);
    expect(() =>
      validateChangeEnvelope({
        ...valid(),
        ops: [{ ...valid().ops[0], value: Number.NaN }],
      }),
    ).toThrow(/finite JSON/);
  });

  test("one atomic change cannot assign one register twice", () => {
    expect(() =>
      validateChangeEnvelope({
        ...valid(),
        ops: [valid().ops[0], valid().ops[0]],
      }),
    ).toThrow(/same register/);
  });

  test("same dot with different bytes is rejected", () => {
    const first = matchingCandidate(valid());
    expect(() =>
      mergeRegisterStates(
        { candidates: [first] },
        { candidates: [{ ...first, value: "different" }] },
      ),
    ).toThrow(/same dot/);
  });

  test("causal cycles are rejected", () => {
    const a: Candidate = {
      dot: { actorId: "a", sequence: 1 },
      context: { b: 1 },
      lamport: 1,
      value: "a",
    };
    const b: Candidate = {
      dot: { actorId: "b", sequence: 1 },
      context: { a: 1 },
      lamport: 1,
      value: "b",
    };
    expect(() => mergeCandidate({ candidates: [a] }, b)).toThrow(
      /causal cycle/,
    );
  });

  test("causal cycles of three or more candidates are rejected", () => {
    const a: Candidate = {
      dot: { actorId: "a", sequence: 1 },
      context: { b: 1 },
      lamport: 1,
      value: "a",
    };
    const b: Candidate = {
      dot: { actorId: "b", sequence: 1 },
      context: { c: 1 },
      lamport: 1,
      value: "b",
    };
    const c: Candidate = {
      dot: { actorId: "c", sequence: 1 },
      context: { a: 1 },
      lamport: 1,
      value: "c",
    };
    expect(() => normalizeRegisterState({ candidates: [a, b, c] })).toThrow(
      /causal cycle/,
    );
  });

  test("numeric JSON is safe and cross-runtime canonical", () => {
    expect(() => stableJson(9_007_199_254_740_992)).toThrow(/safe integers/);
    expect(() => stableJson(181.25)).toThrow(/portable decimals/);
    expect(() => stableJson(12.971598765)).toThrow(/portable decimals/);
    expect(stableJson({ lat: 12.9715987, lng: -77.5945623 })).toBe(
      '{"lat":12.9715987,"lng":-77.5945623}',
    );
    expect(stableJson(-0)).toBe("0");
  });

  test("prototype-shaped actor ids remain ordinary context entries", () => {
    const envelope = validateChangeEnvelope(
      JSON.parse(`{
        "protocol":2,
        "epoch":"epoch",
        "changeId":"__proto__:2",
        "actorId":"__proto__",
        "sequence":2,
        "context":{"__proto__":1},
        "lamport":2,
        "wallTimeMs":1,
        "schemaVersion":1,
        "ops":[{"kind":"assign","resource":"transactions","entityId":"t","field":"notes","value":"safe"}]
      }`),
    );
    expect(
      Object.prototype.hasOwnProperty.call(envelope.context, "__proto__"),
    ).toBe(true);
    expect(envelope.context.__proto__).toBe(1);
    expect(canonicalChangeJson(envelope)).toContain('"__proto__":1');
  });

  test("canonical JSON recursively sorts keys and canonicalizes changes", () => {
    expect(stableJson({ z: null, a: { y: 2, x: 1 } })).toBe(
      '{"a":{"x":1,"y":2},"z":null}',
    );
    const shuffled = {
      ops: valid().ops,
      wallTimeMs: 1,
      lamport: 2,
      context: { phone: 1 },
      sequence: 2,
      actorId: "phone",
      changeId: "phone:2",
      schemaVersion: 1,
      epoch: "epoch",
      protocol: 2,
    };
    expect(canonicalChangeJson(shuffled)).toBe(canonicalChangeJson(valid()));
  });
});
