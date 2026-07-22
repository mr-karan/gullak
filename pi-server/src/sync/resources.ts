import { isDeepStrictEqual } from "node:util";

import { and, eq, or } from "drizzle-orm";

import {
  accounts,
  budgets,
  categories,
  categoryGroups,
  payees,
  recurrences,
  syncRegisters,
  tags,
  transactions,
  transactionTags,
} from "../db/schema.ts";
import type { DbOrTx } from "../repos/changelog.ts";
import { stableJson, type JsonValue } from "./crdt.ts";

export const SYNCED_RESOURCES = [
  "accounts",
  "category_groups",
  "categories",
  "payees",
  "transactions",
  "tags",
  "transaction_tags",
  "budgets",
  "recurrences",
] as const;

export type SyncedResource = (typeof SYNCED_RESOURCES)[number];

type ValueKind =
  | "string"
  | "nullable_string"
  | "integer"
  | "nullable_integer"
  | "number"
  | "nullable_number"
  | "boolean";

type ResourceDefinition = {
  // Drizzle's heterogeneous table generics cannot be expressed as one useful
  // union here. The registry is private and every value is a concrete table.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  fields: Readonly<Record<string, ValueKind>>;
  required: readonly string[];
  lifecycle: "$exists" | "$member";
};

export type ProjectionOptions = {
  /** Client commands cannot mutate/delete an already-reconciled transaction.
   * Trusted server commands enforce their force semantics before authoring. */
  protectReconciled?: boolean;
  /** The complete immutable command, used for invariants that concern intent
   * (for example an unlink must explicitly choose the detached label). */
  ops?: readonly {
    resource: string;
    entityId: string;
    field: string;
    value: JsonValue;
  }[];
};

const definitions: Record<SyncedResource, ResourceDefinition> = {
  accounts: {
    table: accounts,
    lifecycle: "$exists",
    required: [
      "name",
      "kind",
      "openingBalanceCents",
      "onBudget",
      "archived",
      "sortOrder",
      "createdAt",
      "updatedAt",
    ],
    fields: {
      name: "string",
      kind: "string",
      openingBalanceCents: "integer",
      reconciledBalanceCents: "nullable_integer",
      reconciledAt: "nullable_integer",
      onBudget: "boolean",
      archived: "boolean",
      sortOrder: "integer",
      createdAt: "integer",
      updatedAt: "integer",
    },
  },
  category_groups: {
    table: categoryGroups,
    lifecycle: "$exists",
    required: ["name", "isIncome", "sortOrder"],
    fields: { name: "string", isIncome: "boolean", sortOrder: "integer" },
  },
  categories: {
    table: categories,
    lifecycle: "$exists",
    required: ["name", "groupId", "hidden", "sortOrder", "updatedAt"],
    fields: {
      name: "string",
      groupId: "string",
      parentId: "nullable_string",
      color: "nullable_integer",
      icon: "nullable_string",
      hidden: "boolean",
      sortOrder: "integer",
      updatedAt: "integer",
    },
  },
  payees: {
    table: payees,
    lifecycle: "$exists",
    required: ["name", "learnCategories", "updatedAt"],
    // useCount is deliberately absent: it is derived from visible
    // transactions, never a replicated scalar register.
    fields: {
      name: "string",
      learnCategories: "boolean",
      updatedAt: "integer",
    },
  },
  transactions: {
    table: transactions,
    lifecycle: "$exists",
    required: [
      "accountId",
      "amountCents",
      "date",
      "cleared",
      "reconciled",
      "origin",
      "isGroupParent",
      "createdAt",
      "updatedAt",
    ],
    fields: {
      accountId: "string",
      categoryId: "nullable_string",
      payeeId: "nullable_string",
      payeeName: "nullable_string",
      amountCents: "integer",
      date: "string",
      notes: "nullable_string",
      latitude: "nullable_number",
      longitude: "nullable_number",
      locationName: "nullable_string",
      cleared: "boolean",
      reconciled: "boolean",
      origin: "string",
      originRef: "nullable_string",
      importedId: "nullable_string",
      transferAccountId: "nullable_string",
      transferGroupId: "nullable_string",
      parentId: "nullable_string",
      // splitTotalCents is deliberately absent. Both it and a split parent's
      // materialized amount are deterministic sums of the visible children.
      groupParentId: "nullable_string",
      isGroupParent: "boolean",
      originalAmountCents: "nullable_integer",
      originalCurrency: "nullable_string",
      createdAt: "integer",
      updatedAt: "integer",
    },
  },
  tags: {
    table: tags,
    lifecycle: "$exists",
    required: ["name", "archived", "createdAt", "updatedAt"],
    fields: {
      name: "string",
      color: "nullable_integer",
      archived: "boolean",
      createdAt: "integer",
      updatedAt: "integer",
    },
  },
  transaction_tags: {
    table: transactionTags,
    lifecycle: "$member",
    required: ["transactionId", "tagId", "updatedAt"],
    fields: {
      transactionId: "string",
      tagId: "string",
      updatedAt: "integer",
    },
  },
  budgets: {
    table: budgets,
    lifecycle: "$exists",
    required: [
      "categoryId",
      "month",
      "targetCents",
      "rolloverCents",
      "updatedAt",
    ],
    fields: {
      categoryId: "string",
      month: "string",
      targetCents: "integer",
      rolloverCents: "integer",
      updatedAt: "integer",
    },
  },
  recurrences: {
    table: recurrences,
    lifecycle: "$exists",
    required: [
      "accountId",
      "amountCents",
      "cadence",
      "nextDate",
      "createdAt",
      "updatedAt",
    ],
    fields: {
      accountId: "string",
      categoryId: "nullable_string",
      payeeId: "nullable_string",
      payeeName: "nullable_string",
      amountCents: "integer",
      notes: "nullable_string",
      cadence: "string",
      nextDate: "string",
      anchorDay: "nullable_integer",
      createdAt: "integer",
      updatedAt: "integer",
    },
  },
};

const derivedFields: Partial<Record<SyncedResource, ReadonlySet<string>>> = {
  payees: new Set(["useCount"]),
  transactions: new Set(["splitTotalCents"]),
};

export class ProjectionValidationError extends Error {
  override readonly name = "ProjectionValidationError";
}

/** Logical and physical identity for the add-wins transaction/tag relation.
 * stableJson is shared by the Dart implementation, so concurrent adds of the
 * same pair address one CRDT entity instead of racing two random row ids. */
export function transactionTagEntityId(
  transactionId: string,
  tagId: string,
): string {
  return `tt:${stableJson([transactionId, tagId])}`;
}

function validateTransactionTagEntityId(entityId: string): void {
  let pair: unknown;
  try {
    pair = entityId.startsWith("tt:")
      ? (JSON.parse(entityId.slice(3)) as unknown)
      : null;
  } catch {
    pair = null;
  }
  if (
    !Array.isArray(pair) ||
    pair.length !== 2 ||
    typeof pair[0] !== "string" ||
    pair[0].length === 0 ||
    typeof pair[1] !== "string" ||
    pair[1].length === 0 ||
    transactionTagEntityId(pair[0], pair[1]) !== entityId
  ) {
    throw new ProjectionValidationError(
      `transaction_tags/${entityId} has an invalid logical relation id`,
    );
  }
}

export function isSyncedResource(value: string): value is SyncedResource {
  return (SYNCED_RESOURCES as readonly string[]).includes(value);
}

/** Stable wire field ids understood by this materializer. Unknown ids are
 * still retained by the CRDT store, but trusted local writers only emit known
 * ids. Derived columns (for example payees.useCount) are absent by design. */
export function knownReplicatedFields(
  resource: SyncedResource,
): readonly string[] {
  return Object.keys(definitions[resource].fields).sort();
}

export function lifecycleField(
  resource: SyncedResource,
): "$exists" | "$member" {
  return definitions[resource].lifecycle;
}

export type LegacySnapshot =
  | { op: "upsert"; payload: Record<string, unknown> }
  | { op: "delete"; payload: null };

/**
 * Projects one CRDT entity into the protocol-v1 row snapshot used only during
 * the mixed-version drain. This deliberately reads the relational projection
 * after materialization; copying the incoming v2 ops would produce partial
 * rows that a v1 client cannot apply.
 */
export function legacySnapshotForEntity(
  tx: DbOrTx,
  resource: SyncedResource,
  entityId: string,
): LegacySnapshot {
  const definition = definitions[resource];
  const row = tx
    .select()
    .from(definition.table)
    .where(eq(definition.table.id, entityId))
    .get() as Record<string, unknown> | undefined;
  if (row === undefined) return { op: "delete", payload: null };
  return { op: "upsert", payload: row };
}

export function registerPolicy(
  resource: string,
  field: string,
): "mvr" | "remove_wins" | "add_wins" {
  if (!isSyncedResource(resource)) {
    throw new ProjectionValidationError(
      `unsupported synced resource ${resource}`,
    );
  }
  if (field === "$exists") return "remove_wins";
  if (field === "$member" && resource === "transaction_tags") return "add_wins";
  if (field.startsWith("$")) {
    throw new ProjectionValidationError(`unsupported reserved field ${field}`);
  }
  return "mvr";
}

export function validateKnownFieldValue(
  resource: SyncedResource,
  field: string,
  value: JsonValue,
): void {
  if (derivedFields[resource]?.has(field) === true) {
    throw new ProjectionValidationError(
      `${resource}.${field} is derived and cannot be replicated`,
    );
  }
  const kind = definitions[resource].fields[field];
  if (kind === undefined) return; // retained opaquely for forward compatibility
  const nullable = kind.startsWith("nullable_");
  if (value === null) {
    if (nullable) return;
    throw new ProjectionValidationError(`${resource}.${field} cannot be null`);
  }
  const base = nullable ? kind.slice("nullable_".length) : kind;
  const valid =
    (base === "string" && typeof value === "string") ||
    (base === "boolean" && typeof value === "boolean") ||
    (base === "integer" &&
      typeof value === "number" &&
      Number.isSafeInteger(value)) ||
    (base === "number" && typeof value === "number" && Number.isFinite(value));
  if (!valid) {
    throw new ProjectionValidationError(`${resource}.${field} must be ${kind}`);
  }
}

/**
 * Rebuild one relational entity from its durable register projection.
 * Unknown fields remain in sync_registers and are intentionally ignored by an
 * older materializer. Explicit JSON null is represented by the text `null`,
 * distinct from SQL NULL (no visible value).
 */
export function materializeEntity(
  tx: DbOrTx,
  epoch: string,
  resource: SyncedResource,
  entityId: string,
): void {
  const definition = definitions[resource];
  if (resource === "transaction_tags") {
    validateTransactionTagEntityId(entityId);
  }
  const registers = tx
    .select()
    .from(syncRegisters)
    .where(
      and(
        eq(syncRegisters.epoch, epoch),
        eq(syncRegisters.resource, resource),
        eq(syncRegisters.entityId, entityId),
      ),
    )
    .all();
  const lifecycle = registers.find((row) => row.field === definition.lifecycle);
  if (lifecycle === undefined || lifecycle.visibleValueJson === null) return;
  const visible = parseVisible(lifecycle.visibleValueJson);
  if (typeof visible !== "boolean") {
    throw new ProjectionValidationError(
      `${resource}/${entityId} ${definition.lifecycle} must be boolean`,
    );
  }
  if (!visible) {
    if (resource === "transaction_tags") {
      const transactionId = visibleField(registers, "transactionId");
      const tagId = visibleField(registers, "tagId");
      tx.delete(transactionTags)
        .where(
          transactionId !== null && tagId !== null
            ? or(
                eq(transactionTags.id, entityId),
                and(
                  eq(transactionTags.transactionId, transactionId),
                  eq(transactionTags.tagId, tagId),
                ),
              )
            : eq(transactionTags.id, entityId),
        )
        .run();
    } else {
      tx.delete(definition.table)
        .where(eq(definition.table.id, entityId))
        .run();
    }
    return;
  }

  const projected: Record<string, JsonValue | string> = { id: entityId };
  for (const register of registers) {
    if (register.visibleValueJson === null) continue;
    if (!(register.field in definition.fields)) continue;
    const value = parseVisible(register.visibleValueJson);
    validateKnownFieldValue(resource, register.field, value);
    projected[register.field] = value;
  }

  if (resource === "transaction_tags") {
    const transactionId = projected.transactionId;
    const tagId = projected.tagId;
    if (typeof transactionId !== "string" || typeof tagId !== "string") {
      throw new ProjectionValidationError(
        `transaction_tags/${entityId} is missing its logical pair`,
      );
    }
    const canonicalId = transactionTagEntityId(transactionId, tagId);
    if (entityId !== canonicalId) {
      throw new ProjectionValidationError(
        `transaction_tags/${entityId} must use logical id ${canonicalId}`,
      );
    }
  }

  if (
    resource === "transactions" &&
    (projected.origin === "split" || projected.isGroupParent === true)
  ) {
    // Split/group parent amounts are derived from their visible children (or
    // zero for a virtual group header). Give a from-scratch materialization a
    // valid temporary value; recomputeDerivedProjection replaces it after all
    // targets in the envelope have materialized. No independent amount fact is
    // authored for these structural rows.
    projected.amountCents = 0;
  }

  const current = tx
    .select()
    .from(definition.table)
    .where(
      resource === "transaction_tags" &&
        typeof projected.transactionId === "string" &&
        typeof projected.tagId === "string"
        ? or(
            eq(definition.table.id, entityId),
            and(
              eq(transactionTags.transactionId, projected.transactionId),
              eq(transactionTags.tagId, projected.tagId),
            ),
          )
        : eq(definition.table.id, entityId),
    )
    .get() as Record<string, unknown> | undefined;
  const complete =
    current === undefined ? projected : { ...current, ...projected };
  if (current === undefined) {
    const missing = definition.required.filter((field) => !(field in complete));
    if (missing.length > 0) {
      throw new ProjectionValidationError(
        `${resource}/${entityId} create is missing ${missing.join(", ")}`,
      );
    }
  }
  if (
    resource === "transaction_tags" &&
    current !== undefined &&
    current.id !== entityId
  ) {
    // Genesis/cutover may encounter a legacy random physical id for this pair.
    // Replace it in the same transaction before inserting the canonical row.
    tx.delete(transactionTags)
      .where(eq(transactionTags.id, String(current.id)))
      .run();
  }
  tx.insert(definition.table)
    .values(complete)
    .onConflictDoUpdate({ target: definition.table.id, set: complete })
    .run();
}

export function materializeChangeTargets(
  tx: DbOrTx,
  epoch: string,
  targets: Iterable<{ resource: string; entityId: string }>,
  options: ProjectionOptions = {},
): void {
  const unique = new Map<
    string,
    { resource: SyncedResource; entityId: string }
  >();
  for (const target of targets) {
    if (!isSyncedResource(target.resource)) {
      throw new ProjectionValidationError(
        `unsupported synced resource ${target.resource}`,
      );
    }
    unique.set(`${target.resource}\u0000${target.entityId}`, {
      resource: target.resource,
      entityId: target.entityId,
    });
  }
  const reconciledBefore = options.protectReconciled
    ? new Map(
        tx
          .select()
          .from(transactions)
          .all()
          .filter((row) => row.reconciled)
          .map((row) => [row.id, row]),
      )
    : null;

  validateCommandIntent(options.ops ?? []);
  const ordered = [...unique.values()].sort((left, right) => {
    const leftDeleted = lifecycleProjection(tx, epoch, left) === false;
    const rightDeleted = lifecycleProjection(tx, epoch, right) === false;
    if (leftDeleted !== rightDeleted) return leftDeleted ? -1 : 1;
    const direction = leftDeleted ? -1 : 1;
    return (
      direction * (resourceRank(left.resource) - resourceRank(right.resource))
    );
  });
  for (const target of ordered) {
    materializeEntity(tx, epoch, target.resource, target.entityId);
  }
  recomputeDerivedProjection(tx);
  validateProjectedState(tx);
  if (reconciledBefore !== null) {
    assertReconciledRowsUnchanged(tx, reconciledBefore);
  }
}

/** Validate the complete relational projection after all operations in one
 * immutable envelope have materialized. This is intentionally global: deleting
 * a referenced entity is just as dangerous as creating a dangling child. */
export function validateProjectedState(
  tx: DbOrTx,
  options: { allowLegacyTransactionTagIds?: boolean } = {},
): void {
  const accountRows = tx.select().from(accounts).all();
  const groupRows = tx.select().from(categoryGroups).all();
  const categoryRows = tx.select().from(categories).all();
  const payeeRows = tx.select().from(payees).all();
  const transactionRows = tx.select().from(transactions).all();
  const tagRows = tx.select().from(tags).all();
  const linkRows = tx.select().from(transactionTags).all();
  const budgetRows = tx.select().from(budgets).all();
  const recurrenceRows = tx.select().from(recurrences).all();

  const accountIds = ids(accountRows);
  const groupIds = ids(groupRows);
  const categoriesById = new Map(categoryRows.map((row) => [row.id, row]));
  const payeesById = new Map(payeeRows.map((row) => [row.id, row]));
  const transactionsById = new Map(transactionRows.map((row) => [row.id, row]));
  const tagIds = ids(tagRows);

  for (const category of categoryRows) {
    requireReference(
      groupIds,
      category.groupId,
      `categories/${category.id}.groupId`,
    );
    if (category.parentId !== null) {
      const parent = categoriesById.get(category.parentId);
      if (parent === undefined) {
        invalid(
          `categories/${category.id}.parentId references missing category ${category.parentId}`,
        );
      }
      if (parent.parentId !== null) {
        invalid(`categories/${category.id} exceeds one nesting level`);
      }
      if (parent.groupId !== category.groupId) {
        invalid(`categories/${category.id} must share its parent's group`);
      }
    }
  }

  for (const transaction of transactionRows) {
    requireReference(
      accountIds,
      transaction.accountId,
      `transactions/${transaction.id}.accountId`,
    );
    optionalReference(
      categoriesById,
      transaction.categoryId,
      `transactions/${transaction.id}.categoryId`,
    );
    optionalReference(
      payeesById,
      transaction.payeeId,
      `transactions/${transaction.id}.payeeId`,
    );
    optionalReference(
      accountIds,
      transaction.transferAccountId,
      `transactions/${transaction.id}.transferAccountId`,
    );
    if (transaction.reconciled && !transaction.cleared) {
      invalid(`transactions/${transaction.id} is reconciled but not cleared`);
    }
    if (
      (transaction.originalAmountCents === null) !==
      (transaction.originalCurrency === null)
    ) {
      invalid(
        `transactions/${transaction.id} must set original amount and currency together`,
      );
    }
    if (!isValidYmd(transaction.date)) {
      invalid(
        `transactions/${transaction.id}.date is not a real YYYY-MM-DD date`,
      );
    }
    if (transaction.parentId !== null) {
      const parent = transactionsById.get(transaction.parentId);
      if (parent === undefined) {
        invalid(
          `transactions/${transaction.id}.parentId references missing transaction ${transaction.parentId}`,
        );
      }
      if (parent.parentId !== null || parent.isGroupParent) {
        invalid(`transactions/${transaction.id} has an invalid split parent`);
      }
      if (parent.accountId !== transaction.accountId) {
        invalid(
          `transactions/${transaction.id} and its split parent must share an account`,
        );
      }
      if (
        transaction.transferGroupId !== null ||
        transaction.groupParentId !== null ||
        transaction.isGroupParent
      ) {
        invalid(
          `transactions/${transaction.id} mixes split, transfer, or group roles`,
        );
      }
    }
    if (transaction.groupParentId !== null) {
      const parent = transactionsById.get(transaction.groupParentId);
      if (parent === undefined || !parent.isGroupParent) {
        invalid(
          `transactions/${transaction.id}.groupParentId is not a group parent`,
        );
      }
      if (
        transaction.parentId !== null ||
        transaction.transferGroupId !== null ||
        transaction.isGroupParent
      ) {
        invalid(
          `transactions/${transaction.id} mixes group, split, or transfer roles`,
        );
      }
    }
    if (transaction.isGroupParent) {
      if (
        transaction.amountCents !== 0 ||
        transaction.parentId !== null ||
        transaction.groupParentId !== null ||
        transaction.transferGroupId !== null ||
        transaction.transferAccountId !== null
      ) {
        invalid(
          `transactions/${transaction.id} has invalid group-parent structure`,
        );
      }
      const childCount = transactionRows.filter(
        (row) => row.groupParentId === transaction.id,
      ).length;
      if (childCount < 2) {
        invalid(
          `transactions/${transaction.id} group must contain at least two children`,
        );
      }
    }
  }

  validateSplitStructure(transactionRows, transactionsById);
  validateTransferStructure(transactionRows);

  for (const link of linkRows) {
    requireReference(
      transactionsById,
      link.transactionId,
      `transaction_tags/${link.id}.transactionId`,
    );
    requireReference(tagIds, link.tagId, `transaction_tags/${link.id}.tagId`);
    const canonicalId = transactionTagEntityId(link.transactionId, link.tagId);
    if (!options.allowLegacyTransactionTagIds && link.id !== canonicalId) {
      invalid(`transaction_tags/${link.id} must use logical id ${canonicalId}`);
    }
  }
  for (const budget of budgetRows) {
    requireReference(
      categoriesById,
      budget.categoryId,
      `budgets/${budget.id}.categoryId`,
    );
    if (!/^\d{4}-\d{2}$/.test(budget.month)) {
      invalid(`budgets/${budget.id}.month is not YYYY-MM`);
    }
  }
  for (const recurrence of recurrenceRows) {
    requireReference(
      accountIds,
      recurrence.accountId,
      `recurrences/${recurrence.id}.accountId`,
    );
    optionalReference(
      categoriesById,
      recurrence.categoryId,
      `recurrences/${recurrence.id}.categoryId`,
    );
    optionalReference(
      payeesById,
      recurrence.payeeId,
      `recurrences/${recurrence.id}.payeeId`,
    );
    if (
      !["daily", "weekly", "monthly", "yearly"].includes(recurrence.cadence)
    ) {
      invalid(`recurrences/${recurrence.id}.cadence is invalid`);
    }
    if (!isValidYmd(recurrence.nextDate)) {
      invalid(
        `recurrences/${recurrence.id}.nextDate is not a real YYYY-MM-DD date`,
      );
    }
    if (
      recurrence.anchorDay !== null &&
      (recurrence.anchorDay < 1 || recurrence.anchorDay > 31)
    ) {
      invalid(`recurrences/${recurrence.id}.anchorDay is outside 1..31`);
    }
  }

  for (const account of accountRows) {
    if (
      (account.reconciledAt === null) !==
      (account.reconciledBalanceCents === null)
    ) {
      invalid(
        `accounts/${account.id} must set reconciliation time and balance together`,
      );
    }
  }
}

function validateCommandIntent(ops: ProjectionOptions["ops"]): void {
  const fieldsByTarget = new Map<string, Map<string, JsonValue>>();
  for (const op of ops ?? []) {
    const key = `${op.resource}\u0000${op.entityId}`;
    const fields = fieldsByTarget.get(key) ?? new Map<string, JsonValue>();
    fields.set(op.field, op.value);
    fieldsByTarget.set(key, fields);
  }
  for (const [target, fields] of fieldsByTarget) {
    const separator = target.indexOf("\u0000");
    const resource = target.slice(0, separator);
    const entityId = target.slice(separator + 1);
    if (
      (resource === "transactions" || resource === "recurrences") &&
      fields.get("payeeId") === null &&
      !fields.has("payeeName")
    ) {
      throw new ProjectionValidationError(
        `${resource}/${entityId} unlink must explicitly assign payeeName`,
      );
    }
  }
}

/** Rebuilds non-authoritative caches/totals from canonical visible rows. */
export function recomputeDerivedProjection(tx: DbOrTx): void {
  const transactionRows = tx.select().from(transactions).all();
  const splitSums = new Map<string, number>();
  for (const row of transactionRows) {
    if (row.parentId === null) continue;
    const total = (splitSums.get(row.parentId) ?? 0) + row.amountCents;
    if (!Number.isSafeInteger(total)) {
      invalid(
        `split children of ${row.parentId} exceed safe integer money range`,
      );
    }
    splitSums.set(row.parentId, total);
  }

  const payeeNames = new Map(
    tx
      .select({ id: payees.id, name: payees.name })
      .from(payees)
      .all()
      .map((row) => [row.id, row.name]),
  );
  const useCounts = new Map<string, number>();
  for (const row of transactionRows) {
    if (row.payeeId !== null && row.parentId === null && !row.isGroupParent) {
      useCounts.set(row.payeeId, (useCounts.get(row.payeeId) ?? 0) + 1);
    }
    const splitTotal = splitSums.get(row.id) ?? null;
    const derivedAmount = row.isGroupParent
      ? 0
      : splitTotal === null
        ? row.amountCents
        : splitTotal;
    const canonicalPayeeName =
      row.payeeId === null
        ? row.payeeName
        : (payeeNames.get(row.payeeId) ?? row.payeeName);
    if (
      row.splitTotalCents !== splitTotal ||
      row.amountCents !== derivedAmount ||
      row.payeeName !== canonicalPayeeName
    ) {
      tx.update(transactions)
        .set({
          splitTotalCents: splitTotal,
          amountCents: derivedAmount,
          payeeName: canonicalPayeeName,
        })
        .where(eq(transactions.id, row.id))
        .run();
    }
  }

  for (const payee of tx.select().from(payees).all()) {
    const count = useCounts.get(payee.id) ?? 0;
    if (payee.useCount !== count) {
      tx.update(payees)
        .set({ useCount: count })
        .where(eq(payees.id, payee.id))
        .run();
    }
  }

  for (const recurrence of tx.select().from(recurrences).all()) {
    if (recurrence.payeeId === null) continue;
    const canonical = payeeNames.get(recurrence.payeeId);
    if (canonical !== undefined && recurrence.payeeName !== canonical) {
      tx.update(recurrences)
        .set({ payeeName: canonical })
        .where(eq(recurrences.id, recurrence.id))
        .run();
    }
  }
}

function validateSplitStructure(
  rows: Array<typeof transactions.$inferSelect>,
  byId: Map<string, typeof transactions.$inferSelect>,
): void {
  const childrenByParent = new Map<
    string,
    (typeof transactions.$inferSelect)[]
  >();
  for (const row of rows) {
    if (row.parentId === null) continue;
    const children = childrenByParent.get(row.parentId) ?? [];
    children.push(row);
    childrenByParent.set(row.parentId, children);
  }
  for (const [parentId, children] of childrenByParent) {
    const parent = byId.get(parentId);
    if (parent === undefined) continue; // the reference check reports it
    const total = children.reduce((sum, child) => sum + child.amountCents, 0);
    if (!Number.isSafeInteger(total)) {
      invalid(
        `transactions/${parentId} split total exceeds safe integer range`,
      );
    }
    if (
      parent.amountCents !== total ||
      parent.splitTotalCents !== total ||
      parent.categoryId !== null ||
      parent.transferGroupId !== null ||
      parent.groupParentId !== null ||
      parent.isGroupParent
    ) {
      invalid(`transactions/${parentId} has invalid split-parent structure`);
    }
  }
  for (const row of rows) {
    if (!childrenByParent.has(row.id) && row.splitTotalCents !== null) {
      invalid(
        `transactions/${row.id} has a split total without visible children`,
      );
    }
  }
}

function validateTransferStructure(
  rows: Array<typeof transactions.$inferSelect>,
): void {
  const groups = new Map<string, Array<typeof transactions.$inferSelect>>();
  for (const row of rows) {
    if (row.transferGroupId === null) {
      if (row.transferAccountId !== null) {
        invalid(
          `transactions/${row.id} has transferAccountId without transferGroupId`,
        );
      }
      continue;
    }
    const legs = groups.get(row.transferGroupId) ?? [];
    legs.push(row);
    groups.set(row.transferGroupId, legs);
  }
  for (const [groupId, legs] of groups) {
    if (legs.length !== 2) {
      invalid(`transfer ${groupId} must contain exactly two legs`);
    }
    const [left, right] = legs as [
      typeof transactions.$inferSelect,
      typeof transactions.$inferSelect,
    ];
    if (
      left.accountId === right.accountId ||
      left.transferAccountId !== right.accountId ||
      right.transferAccountId !== left.accountId ||
      left.amountCents !== -right.amountCents ||
      left.date !== right.date ||
      left.notes !== right.notes
    ) {
      invalid(`transfer ${groupId} legs do not mirror each other`);
    }
    for (const leg of legs) {
      if (
        leg.categoryId !== null ||
        leg.parentId !== null ||
        leg.splitTotalCents !== null ||
        leg.groupParentId !== null ||
        leg.isGroupParent
      ) {
        invalid(
          `transactions/${leg.id} mixes transfer with another structural role`,
        );
      }
    }
  }
}

function assertReconciledRowsUnchanged(
  tx: DbOrTx,
  before: Map<string, typeof transactions.$inferSelect>,
): void {
  const after = new Map(
    tx
      .select()
      .from(transactions)
      .all()
      .map((row) => [row.id, row]),
  );
  for (const [id, oldRow] of before) {
    const nextRow = after.get(id);
    if (nextRow === undefined) {
      invalid(
        `reconciled transaction ${id} cannot be deleted by a client command`,
      );
    }
    const oldComparable = { ...oldRow, payeeName: null, splitTotalCents: null };
    const nextComparable = {
      ...nextRow,
      payeeName: null,
      splitTotalCents: null,
    };
    if (!isDeepStrictEqual(oldComparable, nextComparable)) {
      invalid(`reconciled transaction ${id} is locked`);
    }
  }
}

function lifecycleProjection(
  tx: DbOrTx,
  epoch: string,
  target: { resource: SyncedResource; entityId: string },
): boolean | null {
  const row = tx
    .select({ visibleValueJson: syncRegisters.visibleValueJson })
    .from(syncRegisters)
    .where(
      and(
        eq(syncRegisters.epoch, epoch),
        eq(syncRegisters.resource, target.resource),
        eq(syncRegisters.entityId, target.entityId),
        eq(syncRegisters.field, lifecycleField(target.resource)),
      ),
    )
    .get();
  if (row?.visibleValueJson === undefined || row.visibleValueJson === null) {
    return null;
  }
  const value = parseVisible(row.visibleValueJson);
  return typeof value === "boolean" ? value : null;
}

function resourceRank(resource: SyncedResource): number {
  return SYNCED_RESOURCES.indexOf(resource);
}

function visibleField(
  registers: Array<typeof syncRegisters.$inferSelect>,
  field: string,
): string | null {
  const value = registers.find((row) => row.field === field)?.visibleValueJson;
  if (value === undefined || value === null) return null;
  const parsed = parseVisible(value);
  return typeof parsed === "string" ? parsed : null;
}

function ids(rows: Array<{ id: string }>): Set<string> {
  return new Set(rows.map((row) => row.id));
}

function requireReference(
  haystack: Set<string> | Map<string, unknown>,
  id: string,
  label: string,
): void {
  if (id.length === 0 || !haystack.has(id)) {
    invalid(`${label} references missing entity ${id}`);
  }
}

function optionalReference(
  haystack: Set<string> | Map<string, unknown>,
  id: string | null,
  label: string,
): void {
  if (id !== null) requireReference(haystack, id, label);
}

function isValidYmd(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function invalid(reason: string): never {
  throw new ProjectionValidationError(reason);
}

function parseVisible(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch (error) {
    throw new ProjectionValidationError(
      `invalid visible JSON: ${String(error)}`,
    );
  }
}
