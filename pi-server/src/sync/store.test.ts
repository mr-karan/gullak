import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, test } from "vitest";

import * as schema from "../db/schema.ts";
import type { ChangeEnvelope, JsonValue } from "./crdt.ts";
import { canonicalRegisterJson } from "./crdt.ts";
import { applySyncChange, canonicalChangeHash } from "./store.ts";

const epoch = "epoch-test-v2";

function makeDb(status = "active", localLamport = 0) {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.insert(schema.syncEpochs)
    .values({ id: epoch, protocol: 2, schemaVersion: 1, status })
    .run();
  db.insert(schema.syncLocalClocks)
    .values({
      epoch,
      actorId: "server-local",
      nextSequence: 1,
      lamport: localLamport,
      integratedCursor: 0,
    })
    .run();
  return { db, sqlite };
}

type ChangeOptions = {
  actorId?: string;
  sequence?: number;
  context?: Record<string, number>;
  lamport?: number;
  wallTimeMs?: number;
  schemaVersion?: number;
  changeEpoch?: string;
  ops?: ChangeEnvelope["ops"];
  field?: string;
  value?: JsonValue;
};

function change(options: ChangeOptions = {}): ChangeEnvelope {
  const actorId = options.actorId ?? "phone";
  const sequence = options.sequence ?? 1;
  return {
    protocol: 2,
    epoch: options.changeEpoch ?? epoch,
    changeId: `${actorId}:${sequence}`,
    actorId,
    sequence,
    context:
      options.context ?? (sequence === 1 ? {} : { [actorId]: sequence - 1 }),
    lamport: options.lamport ?? sequence,
    wallTimeMs: options.wallTimeMs ?? 1000,
    schemaVersion: options.schemaVersion ?? 1,
    ops: options.ops ?? [
      {
        kind: "assign",
        resource: "transactions",
        entityId: "txn-1",
        field: options.field ?? "notes",
        value: options.value ?? "probe",
      },
    ],
  };
}

function register(db: ReturnType<typeof makeDb>["db"], field = "notes") {
  return db
    .select()
    .from(schema.syncRegisters)
    .where(
      and(
        eq(schema.syncRegisters.epoch, epoch),
        eq(schema.syncRegisters.resource, "transactions"),
        eq(schema.syncRegisters.entityId, "txn-1"),
        eq(schema.syncRegisters.field, field),
      ),
    )
    .get();
}

function apply(db: ReturnType<typeof makeDb>["db"], envelope: unknown) {
  return applySyncChange(db, envelope, {
    source: "test",
    acceptedAt: 1234,
  });
}

describe("immutable change admission", () => {
  test("accepts in active and preparing epochs and advances durable metadata", () => {
    for (const status of ["active", "preparing"]) {
      const { db, sqlite } = makeDb(status);
      const envelope = change();
      const result = apply(db, envelope);

      expect(result.status).toBe("accepted");
      expect(result.transportCursor).toBe(1);
      if (result.status === "accepted") {
        expect(result.contentHash).toBe(canonicalChangeHash(envelope));
      }
      expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);
      expect(register(db)?.visibleValueJson).toBe('"probe"');
      expect(db.select().from(schema.syncFrontiers).get()).toMatchObject({
        actorId: "phone",
        contiguousSequence: 1,
        integratedCursor: 1,
      });
      expect(db.select().from(schema.syncLocalClocks).get()).toMatchObject({
        lamport: 1,
        integratedCursor: 1,
      });
      sqlite.close();
    }
  });

  test("an exact canonical duplicate is idempotent", () => {
    const { db } = makeDb();
    const envelope = change({
      field: "future.metadata",
      value: { z: null, a: [1, true] },
    });
    const accepted = apply(db, envelope);
    const duplicate = apply(db, structuredClone(envelope));

    expect(accepted.status).toBe("accepted");
    expect(duplicate).toMatchObject({
      status: "duplicate",
      transportCursor: accepted.transportCursor,
      contentHash: canonicalChangeHash(envelope),
    });
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);
    expect(db.select().from(schema.syncRegisters).all()).toHaveLength(1);
  });

  test("a missing actor sequence is retryable and writes nothing", () => {
    const { db } = makeDb();
    const result = apply(db, change({ sequence: 2 }));

    expect(result).toMatchObject({
      status: "gap",
      retryable: true,
      expectedSequence: 1,
      receivedSequence: 2,
      transportCursor: null,
    });
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
    expect(db.select().from(schema.syncRegisters).all()).toHaveLength(0);
    expect(db.select().from(schema.syncFrontiers).all()).toHaveLength(0);
    expect(db.select().from(schema.syncQuarantine).all()).toHaveLength(0);
  });

  test("an unseen cross-actor dependency is retryable and cannot erase later facts", () => {
    const { db } = makeDb();
    const forgedContext = change({
      actorId: "web",
      context: { phone: 99 },
      lamport: 100,
      value: "forged",
    });
    const result = apply(db, forgedContext);

    expect(result).toMatchObject({
      status: "dependency_gap",
      retryable: true,
      transportCursor: null,
      missingDependencies: [
        { actorId: "phone", requiredSequence: 99, acceptedSequence: 0 },
      ],
    });
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
    expect(db.select().from(schema.syncRegisters).all()).toHaveLength(0);
    expect(db.select().from(schema.syncFrontiers).all()).toHaveLength(0);
    expect(db.select().from(schema.syncQuarantine).all()).toHaveLength(0);

    expect(
      apply(db, change({ actorId: "phone", value: "legitimate" })).status,
    ).toBe("accepted");
    expect(register(db)?.visibleValueJson).toBe('"legitimate"');
  });

  test("a client cannot poison concurrent priority with a forged Lamport", () => {
    const { db } = makeDb();
    const result = apply(
      db,
      change({ actorId: "attacker", lamport: 9_000_000_000, value: "poison" }),
    );

    expect(result).toMatchObject({
      status: "rejected",
      code: "invalid_lamport",
      transportCursor: null,
    });
    expect(result.status === "rejected" ? result.reason : "").toMatch(
      /must equal 1/,
    );
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
    expect(db.select().from(schema.syncRegisters).all()).toHaveLength(0);
    expect(db.select().from(schema.syncFrontiers).all()).toHaveLength(0);
  });

  test("a valid cross-actor observed context derives and accepts Lamport", () => {
    const { db } = makeDb();
    expect(apply(db, change({ actorId: "phone", lamport: 1 })).status).toBe(
      "accepted",
    );
    const observed = apply(
      db,
      change({
        actorId: "web",
        context: { phone: 1 },
        lamport: 2,
        value: "observed successor",
      }),
    );
    expect(observed.status).toBe("accepted");
    expect(register(db)?.visibleValueJson).toBe('"observed successor"');
  });

  test("a submitted context must include the transitive causal closure", () => {
    const { db } = makeDb();
    expect(
      apply(db, change({ actorId: "b", value: "b", lamport: 1 })).status,
    ).toBe("accepted");
    expect(
      apply(
        db,
        change({
          actorId: "a",
          context: { b: 1 },
          value: "a observed b",
          lamport: 2,
        }),
      ).status,
    ).toBe("accepted");

    const omittedAncestor = apply(
      db,
      change({
        actorId: "c",
        context: { a: 1 },
        value: "c claims a but omits b",
        lamport: 3,
      }),
    );
    expect(omittedAncestor).toMatchObject({
      status: "rejected",
      code: "invalid_context",
      transportCursor: null,
    });
    expect(
      omittedAncestor.status === "rejected" ? omittedAncestor.reason : "",
    ).toMatch(/a:1 requires b:1/);

    expect(
      apply(
        db,
        change({
          actorId: "c",
          context: { a: 1, b: 1 },
          value: "closed context",
          lamport: 3,
        }),
      ).status,
    ).toBe("accepted");
    expect(register(db)?.visibleValueJson).toBe('"closed context"');
  });

  test("an unknown or retired epoch is explicitly rejected", () => {
    const { db } = makeDb();
    expect(apply(db, change({ changeEpoch: "unknown-epoch" }))).toMatchObject({
      status: "rejected",
      code: "wrong_epoch",
    });

    db.update(schema.syncEpochs)
      .set({ status: "retired" })
      .where(eq(schema.syncEpochs.id, epoch))
      .run();
    expect(apply(db, change())).toMatchObject({
      status: "rejected",
      code: "wrong_epoch",
    });
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
  });

  test("an unsupported envelope schema is permanently rejected", () => {
    const { db } = makeDb();
    const result = apply(
      db,
      change({
        schemaVersion: 2,
        ops: [
          {
            kind: "assign",
            resource: "future_resource",
            entityId: "future-1",
            field: "futureField",
            value: "opaque",
          },
        ],
      }),
    );
    expect(result).toMatchObject({
      status: "rejected",
      code: "unsupported_schema",
      transportCursor: null,
    });
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
    expect(db.select().from(schema.syncRegisters).all()).toHaveLength(0);
    expect(db.select().from(schema.syncFrontiers).all()).toHaveLength(0);
  });

  test("reusing a dot/changeId with different canonical bytes is rejected", () => {
    const { db } = makeDb();
    expect(apply(db, change({ value: "first" })).status).toBe("accepted");
    const reused = apply(db, change({ value: "different" }));

    expect(reused).toMatchObject({
      status: "rejected",
      code: "identity_reuse",
      transportCursor: null,
    });
    expect(register(db)?.visibleValueJson).toBe('"first"');
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);
  });

  test("known field types fail before persistence while unknown fields remain opaque", () => {
    const { db } = makeDb();
    const invalid = apply(db, change({ field: "amountCents", value: 1.5 }));
    expect(invalid).toMatchObject({
      status: "rejected",
      code: "invalid_envelope",
    });
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);

    const future = apply(
      db,
      change({ field: "future.metadata.v9", value: { opaque: null } }),
    );
    expect(future.status).toBe("accepted");
    expect(register(db, "future.metadata.v9")?.visibleValueJson).toBe(
      '{"opaque":null}',
    );
  });
});

describe("register integration", () => {
  test("concurrent same-field assignments retain both candidates and report conflict", () => {
    const { db } = makeDb();
    expect(apply(db, change({ actorId: "phone", value: "phone" })).status).toBe(
      "accepted",
    );
    const result = apply(
      db,
      change({ actorId: "web", value: "web", lamport: 1 }),
    );

    expect(result.status).toBe("accepted");
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]).toMatchObject({
      resource: "transactions",
      entityId: "txn-1",
      field: "notes",
      policy: "mvr",
      candidateCount: 2,
      winner: { dot: { actorId: "web", sequence: 1 } },
    });
    const row = register(db);
    expect(row?.visibleValueJson).toBe('"web"');
    expect(JSON.parse(row?.candidatesJson ?? "").candidates).toHaveLength(2);
  });

  test("a causal successor removes the predecessor", () => {
    const { db } = makeDb();
    apply(
      db,
      change({ actorId: "phone", value: "old", wallTimeMs: 9_000_000_000_000 }),
    );
    const result = apply(
      db,
      change({
        actorId: "web",
        context: { phone: 1 },
        lamport: 2,
        value: "new",
        wallTimeMs: 0,
      }),
    );

    expect(result.status).toBe("accepted");
    expect(result.conflicts).toHaveLength(0);
    const row = register(db);
    expect(row?.visibleValueJson).toBe('"new"');
    expect(JSON.parse(row?.candidatesJson ?? "").candidates).toHaveLength(1);
  });

  test("reserved lifecycle and membership fields select their policies", () => {
    const { db } = makeDb();
    const result = apply(
      db,
      change({
        ops: [
          {
            kind: "assign",
            resource: "transactions",
            entityId: "txn-1",
            field: "$exists",
            value: false,
          },
          {
            kind: "assign",
            resource: "transaction_tags",
            entityId: "txn-1:tag-1",
            field: "$member",
            value: true,
          },
        ],
      }),
    );

    expect(result.status).toBe("accepted");
    const rows = db.select().from(schema.syncRegisters).all();
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "$exists",
          policy: "remove_wins",
          visibleValueJson: "false",
        }),
        expect.objectContaining({
          field: "$member",
          policy: "add_wins",
          visibleValueJson: "true",
        }),
      ]),
    );
  });

  test("a multi-op change uses one cursor and is fully visible", () => {
    const { db } = makeDb();
    const result = apply(
      db,
      change({
        ops: [
          {
            kind: "assign",
            resource: "transactions",
            entityId: "txn-1",
            field: "notes",
            value: "probe",
          },
          {
            kind: "assign",
            resource: "transactions",
            entityId: "txn-1",
            field: "amountCents",
            value: -4999,
          },
        ],
      }),
    );

    expect(result.status).toBe("accepted");
    expect(db.select().from(schema.syncChanges).all()).toHaveLength(1);
    const rows = db.select().from(schema.syncRegisters).all();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.updatedCursor))).toEqual(new Set([1]));
  });

  test("a throw during a later op rolls back the change and earlier op", () => {
    const { db } = makeDb();
    db.insert(schema.syncRegisters)
      .values({
        epoch,
        resource: "transactions",
        entityId: "txn-1",
        field: "amountCents",
        policy: "mvr",
        candidatesJson: "{}",
        visibleValueJson: null,
        updatedCursor: 0,
      })
      .run();

    expect(() =>
      apply(
        db,
        change({
          ops: [
            {
              kind: "assign",
              resource: "transactions",
              entityId: "txn-1",
              field: "notes",
              value: "must roll back",
            },
            {
              kind: "assign",
              resource: "transactions",
              entityId: "txn-1",
              field: "amountCents",
              value: -1,
            },
          ],
        }),
      ),
    ).toThrow(/register.candidates/);

    expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
    expect(register(db, "notes")).toBeUndefined();
    expect(db.select().from(schema.syncFrontiers).all()).toHaveLength(0);
    expect(db.select().from(schema.syncLocalClocks).get()).toMatchObject({
      lamport: 0,
      integratedCursor: 0,
    });
  });

  test("causal delivery order cannot change the register projection", () => {
    const left = makeDb();
    const right = makeDb();
    const predecessor = change({ actorId: "phone", value: "old", lamport: 1 });
    const successor = change({
      actorId: "web",
      context: { phone: 1 },
      value: "new",
      lamport: 2,
    });

    apply(left.db, predecessor);
    apply(left.db, successor);
    expect(apply(right.db, successor)).toMatchObject({
      status: "dependency_gap",
      retryable: true,
    });
    apply(right.db, predecessor);
    expect(apply(right.db, successor).status).toBe("accepted");

    const leftRow = register(left.db);
    const rightRow = register(right.db);
    expect(leftRow?.candidatesJson).toBe(rightRow?.candidatesJson);
    expect(leftRow?.visibleValueJson).toBe(rightRow?.visibleValueJson);
    expect(
      canonicalRegisterJson(JSON.parse(leftRow?.candidatesJson ?? "")),
    ).toBe(canonicalRegisterJson(JSON.parse(rightRow?.candidatesJson ?? "")));
    expect(leftRow?.visibleValueJson).toBe('"new"');
  });

  test("observing a remote Lamport never moves the server clock backwards", () => {
    const { db } = makeDb("active", 50);
    for (let sequence = 1; sequence <= 50; sequence += 1) {
      expect(
        apply(db, change({ actorId: "phone", sequence, lamport: sequence }))
          .status,
      ).toBe("accepted");
    }
    expect(db.select().from(schema.syncLocalClocks).get()?.lamport).toBe(50);
    expect(
      apply(db, change({ actorId: "phone", sequence: 51, lamport: 51 })).status,
    ).toBe("accepted");
    expect(db.select().from(schema.syncLocalClocks).get()?.lamport).toBe(51);
  });
});
