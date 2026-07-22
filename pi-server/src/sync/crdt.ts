export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type VersionVector = Record<string, number>;

export type Dot = {
  actorId: string;
  sequence: number;
};

export type AssignOp = {
  kind: "assign";
  resource: string;
  entityId: string;
  field: string;
  value: JsonValue;
};

export type ChangeEnvelope = {
  protocol: 2;
  epoch: string;
  changeId: string;
  actorId: string;
  sequence: number;
  context: VersionVector;
  lamport: number;
  wallTimeMs: number;
  schemaVersion: number;
  ops: AssignOp[];
};

export type Candidate = {
  dot: Dot;
  context: VersionVector;
  lamport: number;
  value: JsonValue;
};

export type RegisterState = {
  candidates: Candidate[];
};

export type RegisterConflict = {
  winner: Candidate;
  alternatives: Candidate[];
};

export type RegisterProjection = {
  winner: Candidate | null;
  value: JsonValue | undefined;
  conflict: RegisterConflict | null;
};

export class CrdtValidationError extends Error {
  override readonly name = "CrdtValidationError";
}

const EMPTY_REGISTER: RegisterState = { candidates: [] };
const PORTABLE_DECIMAL_LIMIT = 180;
const PORTABLE_DECIMAL_SCALE = 10_000_000;

function fail(message: string): never {
  throw new CrdtValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`${path} must be an object`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(`${path} must be a non-empty string`);
  }
  return value;
}

function requireInteger(value: unknown, path: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    fail(`${path} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function normalizeJsonValue(value: unknown, path: string): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      fail(`${path} must contain finite JSON numbers`);
    if (Number.isSafeInteger(value)) return Object.is(value, -0) ? 0 : value;

    // Protocol v2 has only one fractional domain: geographic coordinates.
    // Require those values on a fixed 1e-7 degree grid (roughly 1 cm) so
    // JavaScript and Dart hash exactly the same canonical JSON bytes. Never
    // round here: an immutable authored value must either be valid or fail.
    // Other
    // fractional domains must be introduced explicitly (normally as scaled
    // integers), rather than inheriting runtime-specific float formatting.
    if (Math.abs(value) <= PORTABLE_DECIMAL_LIMIT) {
      const scaled = Math.floor(value * PORTABLE_DECIMAL_SCALE + 0.5);
      const normalized = scaled / PORTABLE_DECIMAL_SCALE;
      if (Number.isSafeInteger(scaled) && normalized === value)
        return Object.is(normalized, -0) ? 0 : normalized;
    }
    fail(
      `${path} numbers must be safe integers or portable decimals within ` +
        `[-${PORTABLE_DECIMAL_LIMIT}, ${PORTABLE_DECIMAL_LIMIT}]`,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      normalizeJsonValue(item, `${path}[${index}]`),
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeJsonValue(value[key], `${path}.${key}`)]),
    );
  }
  return fail(`${path} must be a JSON value`);
}

function normalizeContext(
  value: unknown,
  path: string,
  dot?: Dot,
): VersionVector {
  const record = requireRecord(value, path);
  // Actor ids are untrusted strings. A null-prototype map keeps names such as
  // "__proto__" and "toString" as ordinary causal identities.
  const result: VersionVector = Object.create(null) as VersionVector;
  for (const actorId of Object.keys(record).sort()) {
    requireString(actorId, `${path} actor`);
    result[actorId] = requireInteger(record[actorId], `${path}.${actorId}`, 1);
  }

  if (dot !== undefined) {
    const self = result[dot.actorId];
    if (dot.sequence === 1 && self !== undefined) {
      fail(`${path} must omit the actor's zero sequence`);
    }
    if (dot.sequence > 1 && self !== dot.sequence - 1) {
      fail(`${path}.${dot.actorId} must equal sequence - 1`);
    }
  }
  return result;
}

function normalizeDot(value: unknown, path: string): Dot {
  const record = requireRecord(value, path);
  return {
    actorId: requireString(record.actorId, `${path}.actorId`),
    sequence: requireInteger(record.sequence, `${path}.sequence`, 1),
  };
}

function normalizeAssignOp(value: unknown, path: string): AssignOp {
  const record = requireRecord(value, path);
  if (record.kind !== "assign") fail(`${path}.kind must be "assign"`);
  return {
    kind: "assign",
    resource: requireString(record.resource, `${path}.resource`),
    entityId: requireString(record.entityId, `${path}.entityId`),
    field: requireString(record.field, `${path}.field`),
    value: normalizeJsonValue(record.value, `${path}.value`),
  };
}

export function validateChangeEnvelope(value: unknown): ChangeEnvelope {
  const record = requireRecord(value, "change");
  if (record.protocol !== 2) fail("change.protocol must equal 2");

  const actorId = requireString(record.actorId, "change.actorId");
  const sequence = requireInteger(record.sequence, "change.sequence", 1);
  const dot = { actorId, sequence };
  const changeId = requireString(record.changeId, "change.changeId");
  if (changeId !== `${actorId}:${sequence}`) {
    fail("change.changeId must equal actorId:sequence");
  }
  if (!Array.isArray(record.ops) || record.ops.length === 0) {
    fail("change.ops must be a non-empty array");
  }
  const ops = record.ops.map((op, index) =>
    normalizeAssignOp(op, `change.ops[${index}]`),
  );
  const targets = new Set<string>();
  for (const op of ops) {
    const target = stableJson([op.resource, op.entityId, op.field]);
    if (targets.has(target)) {
      fail("change.ops cannot assign the same register more than once");
    }
    targets.add(target);
  }

  return {
    protocol: 2,
    epoch: requireString(record.epoch, "change.epoch"),
    changeId,
    actorId,
    sequence,
    context: normalizeContext(record.context, "change.context", dot),
    lamport: requireInteger(record.lamport, "change.lamport", 1),
    wallTimeMs: requireInteger(record.wallTimeMs, "change.wallTimeMs", 0),
    schemaVersion: requireInteger(
      record.schemaVersion,
      "change.schemaVersion",
      1,
    ),
    ops,
  };
}

export function validateCandidate(value: unknown): Candidate {
  const record = requireRecord(value, "candidate");
  const dot = normalizeDot(record.dot, "candidate.dot");
  return {
    dot,
    context: normalizeContext(record.context, "candidate.context", dot),
    lamport: requireInteger(record.lamport, "candidate.lamport", 1),
    value: normalizeJsonValue(record.value, "candidate.value"),
  };
}

export function candidateFor(
  changeValue: ChangeEnvelope | unknown,
  opValue: AssignOp | unknown,
): Candidate {
  const change = validateChangeEnvelope(changeValue);
  const op = normalizeAssignOp(opValue, "op");
  const matching = change.ops.some(
    (item) =>
      item.resource === op.resource &&
      item.entityId === op.entityId &&
      item.field === op.field &&
      stableJson(item.value) === stableJson(op.value),
  );
  if (!matching) fail("op must belong to the supplied change");
  return {
    dot: { actorId: change.actorId, sequence: change.sequence },
    context: { ...change.context },
    lamport: change.lamport,
    value: normalizeJsonValue(op.value, "op.value"),
  };
}

export function contextContains(context: VersionVector, dot: Dot): boolean {
  return (context[dot.actorId] ?? 0) >= dot.sequence;
}

function sameDot(left: Dot, right: Dot): boolean {
  return left.actorId === right.actorId && left.sequence === right.sequence;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareDots(left: Dot, right: Dot): number {
  const actor = compareStrings(left.actorId, right.actorId);
  if (actor !== 0) return actor;
  if (left.sequence < right.sequence) return -1;
  if (left.sequence > right.sequence) return 1;
  return 0;
}

export function compareCandidates(left: Candidate, right: Candidate): number {
  if (left.lamport < right.lamport) return -1;
  if (left.lamport > right.lamport) return 1;
  const actor = compareStrings(left.dot.actorId, right.dot.actorId);
  if (actor !== 0) return actor;
  if (left.dot.sequence < right.dot.sequence) return -1;
  if (left.dot.sequence > right.dot.sequence) return 1;
  return 0;
}

function canonicalCandidate(candidate: Candidate): Candidate {
  return {
    dot: { ...candidate.dot },
    context: Object.fromEntries(
      Object.entries(candidate.context).sort(([left], [right]) =>
        compareStrings(left, right),
      ),
    ),
    lamport: candidate.lamport,
    value: normalizeJsonValue(candidate.value, "candidate.value"),
  };
}

export function normalizeRegisterState(
  value: RegisterState | unknown,
): RegisterState {
  const record = requireRecord(value, "register");
  if (!Array.isArray(record.candidates)) {
    fail("register.candidates must be an array");
  }
  const byDot = new Map<string, Candidate>();
  for (const rawCandidate of record.candidates) {
    const candidate = validateCandidate(rawCandidate);
    const key = stableJson(candidate.dot);
    const existing = byDot.get(key);
    if (
      existing !== undefined &&
      stableJson(existing) !== stableJson(candidate)
    ) {
      fail("the same dot cannot identify different candidates");
    }
    byDot.set(key, candidate);
  }

  const candidates = [...byDot.values()];
  const candidateByDot = new Map(
    candidates.map((candidate) => [stableJson(candidate.dot), candidate]),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (candidate: Candidate): void => {
    const key = stableJson(candidate.dot);
    if (visiting.has(key)) {
      fail("candidate contexts cannot contain a causal cycle");
    }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of candidates) {
      if (!contextContains(candidate.context, dependency.dot)) continue;
      const known = candidateByDot.get(stableJson(dependency.dot));
      if (known !== undefined) visit(known);
    }
    visiting.delete(key);
    visited.add(key);
  };
  for (const candidate of candidates) visit(candidate);

  return {
    candidates: candidates
      .filter(
        (candidate) =>
          !candidates.some(
            (other) =>
              !sameDot(candidate.dot, other.dot) &&
              contextContains(other.context, candidate.dot),
          ),
      )
      .map(canonicalCandidate)
      .sort((left, right) => compareDots(left.dot, right.dot)),
  };
}

export function mergeRegisterStates(
  left: RegisterState,
  right: RegisterState,
): RegisterState {
  return normalizeRegisterState({
    candidates: [...left.candidates, ...right.candidates],
  });
}

export function mergeCandidate(
  state: RegisterState,
  candidate: Candidate,
): RegisterState {
  return mergeRegisterStates(state, { candidates: [candidate] });
}

export function foldRegisterCandidates(
  candidates: Iterable<Candidate>,
): RegisterState {
  let state = EMPTY_REGISTER;
  for (const candidate of candidates) state = mergeCandidate(state, candidate);
  return state;
}

export function visibleCandidate(state: RegisterState): Candidate | null {
  const normalized = normalizeRegisterState(state);
  let winner: Candidate | null = null;
  for (const candidate of normalized.candidates) {
    if (winner === null || compareCandidates(candidate, winner) > 0) {
      winner = candidate;
    }
  }
  return winner;
}

export function projectRegister(state: RegisterState): RegisterProjection {
  const normalized = normalizeRegisterState(state);
  const winner = visibleCandidate(normalized);
  if (winner === null)
    return { winner: null, value: undefined, conflict: null };
  const alternatives = normalized.candidates.filter(
    (candidate) => !sameDot(candidate.dot, winner.dot),
  );
  return {
    winner,
    value: winner.value,
    conflict: alternatives.length === 0 ? null : { winner, alternatives },
  };
}

function requireBooleanCandidates(
  state: RegisterState,
  register: string,
): Candidate[] {
  const candidates = normalizeRegisterState(state).candidates;
  for (const candidate of candidates) {
    if (typeof candidate.value !== "boolean") {
      fail(`${register} register candidates must be boolean`);
    }
  }
  return candidates;
}

export function projectRemoveWinsExists(state: RegisterState): boolean {
  const candidates = requireBooleanCandidates(state, "$exists");
  return (
    candidates.length > 0 && candidates.every((candidate) => candidate.value)
  );
}

export function projectAddWinsMembership(state: RegisterState): boolean {
  const candidates = requireBooleanCandidates(state, "membership");
  return candidates.some((candidate) => candidate.value);
}

export function stableJson(value: JsonValue | unknown): string {
  return JSON.stringify(normalizeJsonValue(value, "value"));
}

export function canonicalRegisterJson(state: RegisterState): string {
  return stableJson(normalizeRegisterState(state));
}

export function canonicalChangeJson(change: ChangeEnvelope | unknown): string {
  return stableJson(validateChangeEnvelope(change));
}
