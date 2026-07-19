import { and, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { parseSms, validateCandidate } from "../ai/sms_parser.ts";
import type { AppEnv } from "../app.ts";
import {
  categories,
  payees,
  smsMessages,
  transactions,
  whatsappInboxCandidates,
  type NewSmsMessage,
  type SmsMessage,
} from "../db/schema.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";
import { recordParseFailure } from "../repos/feedback.ts";
import { runRules } from "../rules/engine.ts";

export const smsRouter = new Hono<AppEnv>();

// --- POST /v1/sms/bulk-ingest -----------------------------------------------
// Phone pushes confirmed SMS bodies up to the server. Idempotent on `id`,
// safe to retry. The body is kept server-side so the LLM cleanup job below
// can re-parse and propagate fixes back to the phone via change_log.

const ingestItem = z.object({
  id: z.string().min(1),
  sender: z.string().min(1).max(64),
  body: z.string().min(1).max(4000),
  receivedAt: z.number().int().nonnegative(),
  linkedTransactionId: z.string().min(1).nullable().optional(),
  baseTransactionUpdatedAt: z.number().int().nonnegative().nullable().optional(),
  candidateJson: z.string().max(8000).nullable().optional(),
});

const ingestBody = z.object({
  items: z.array(ingestItem).min(1).max(200),
});

// --- POST /v1/sms/ingest ----------------------------------------------------
// Single inbound bank SMS, parsed server-side and queued for the phone's Inbox.
// This is the iOS auto-capture path: iOS has no SMS-read API, so a Shortcuts
// automation ("When I get a Message from <bank>") POSTs the body here. We run
// the SAME parser the Android path uses, and — like the WhatsApp path — queue a
// reviewable candidate the phone imports on its next sync. It never writes a
// transaction; the user still confirms it in the Inbox. Draft-safe by design.
const singleSmsBody = z.object({
  sender: z.string().min(1).max(64),
  body: z.string().min(1).max(4000),
  // Optional: iOS Shortcuts can't always supply a timestamp; default to now.
  receivedAt: z.number().int().nonnegative().optional(),
});

smsRouter.post("/ingest", async (c) => {
  const db = c.get("db");
  const config = c.get("config");
  const { sender, body, receivedAt } = singleSmsBody.parse(await c.req.json());
  const at = receivedAt ?? nowMs();

  // The model needs the user's category list so the category hint resolves to
  // a real category id (mirrors the reprocess/enrich path).
  const allCategories = db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .all();
  const knownPayees = db
    .select({ id: payees.id, name: payees.name })
    .from(payees)
    .all();

  let result;
  try {
    result = await parseSms(config, {
      sender,
      body,
      receivedAt: at,
      categories: allCategories,
      payees: knownPayees,
    });
  } catch (e) {
    // Operational failure (LLM 402/5xx, timeout). Auto-capture + 503 so the
    // Shortcut/automation can retry later; nothing is queued.
    const error = e instanceof Error ? e.message : String(e);
    recordParseFailure(db, { sender, body, error, operational: true });
    return c.json({ status: "unavailable", error, retryable: true }, 503);
  }

  // Not a transaction (OTP, promo, balance alert, or unparseable): ack quietly
  // so the Shortcut doesn't retry. Nothing is queued.
  if (result.status !== "transaction" || !result.candidate) {
    if (result.status === "parse_failed") {
      recordParseFailure(db, {
        sender,
        body,
        error: result.error ?? "parse_failed",
        operational: false,
      });
    }
    return c.json({ status: result.status, ignored: true });
  }

  // Normalize/categorize the parsed candidate through the server-side rules
  // engine before it becomes a queued draft. Rules are server-only config; they
  // only tweak the draft the user still confirms in the Inbox — no txn is
  // written here. We sign the amount (candidate.amountCents is a magnitude +
  // isIncome flag) so inflow/outflow/amount conditions evaluate correctly, and
  // map the rule outputs (payee, category) back onto the candidate. SmsCandidate
  // has no notes field, so set_notes actions have nowhere to land on this path.
  const ruled = runRules(db, {
    payeeName: result.candidate.payee,
    categoryId: result.candidate.categoryId,
    amountCents: result.candidate.isIncome
      ? result.candidate.amountCents
      : -result.candidate.amountCents,
    date: result.candidate.date,
  });
  result.candidate.payee = ruled.payeeName ?? null;
  result.candidate.categoryId = ruled.categoryId ?? null;

  const id = newId();
  db.insert(whatsappInboxCandidates)
    .values({
      id,
      source: "sms",
      sourceUser: sender,
      itemIndex: 0,
      body,
      receivedAt: at,
      candidateJson: JSON.stringify(result.candidate),
      status: "pending",
      createdAt: nowMs(),
    })
    .run();

  // No recordChange: the candidate is a review-queue entry, not a financial
  // row. It reaches the phone via the inbox-candidates poll (same as WhatsApp),
  // and only becomes a transaction when the user confirms it on-device.
  return c.json({ status: "transaction", id, candidate: result.candidate });
});

smsRouter.post("/bulk-ingest", async (c) => {
  const db = c.get("db");
  const { items } = ingestBody.parse(await c.req.json());
  const at = nowMs();
  let inserted = 0;
  let updated = 0;

  db.transaction((tx) => {
    for (const item of items) {
      const existing = tx
        .select()
        .from(smsMessages)
        .where(eq(smsMessages.id, item.id))
        .get();

      const row: NewSmsMessage = {
        id: item.id,
        sender: item.sender,
        body: item.body,
        receivedAt: item.receivedAt,
        linkedTransactionId: item.linkedTransactionId ?? null,
        baseTransactionUpdatedAt: item.baseTransactionUpdatedAt ?? null,
        candidateJson: item.candidateJson ?? null,
        enrichedJson: existing?.enrichedJson ?? null,
        // If the row already exists and was enriched, leave it that way —
        // re-uploads from the device shouldn't reset it back to pending.
        status: existing?.status ?? "pending",
        enrichedAt: existing?.enrichedAt ?? null,
        createdAt: existing?.createdAt ?? at,
        updatedAt: at,
      };

      tx.insert(smsMessages)
        .values(row)
        .onConflictDoUpdate({
          target: smsMessages.id,
          set: {
            sender: row.sender,
            body: row.body,
            receivedAt: row.receivedAt,
            linkedTransactionId: row.linkedTransactionId,
            baseTransactionUpdatedAt: row.baseTransactionUpdatedAt,
            candidateJson: row.candidateJson,
            updatedAt: row.updatedAt,
          },
        })
        .run();

      if (existing) updated++;
      else inserted++;
    }
  });

  return c.json({ inserted, updated, total: items.length });
});

// --- POST /v1/sms/reprocess --------------------------------------------------
// Run the (LLM-only) parser against stored bodies and PATCH the linked
// transactions with cleaned payee/category. Critical correctness rules:
//
//   1. Cleanup writes go through recordChange() — the phone is the source
//      of truth, server mutations must show up in the next sync pull or
//      they'll be lost when the phone reconciles.
//
//   2. Per-row staleness check: only PATCH a transaction if its current
//      `updated_at` matches the snapshot stored at confirm time. If the
//      user (or any other process) edited the txn after confirm, respect
//      that edit — don't clobber it. `force=true` bypasses this.
//
//   3. Batching: 5–10 bodies per LLM call by default. On any batch
//      failure (parse error, length mismatch, etc.) we split to single-
//      row retries so one bad apple doesn't wedge an entire batch.

const reprocessBody = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  smsIds: z.array(z.string()).max(500).optional(),
  force: z.boolean().optional(),
  batchSize: z.number().int().min(1).max(20).optional(),
});

smsRouter.post("/reprocess", async (c) => {
  const db = c.get("db");
  const config = c.get("config");
  const opts = reprocessBody.parse((await c.req.json().catch(() => ({}))) ?? {});
  const limit = opts.limit ?? 100;
  const force = opts.force ?? false;
  const batchSize = opts.batchSize ?? 5;

  // Pick the work queue.
  let candidates: SmsMessage[];
  if (opts.smsIds && opts.smsIds.length > 0) {
    candidates = db
      .select()
      .from(smsMessages)
      .where(inArray(smsMessages.id, opts.smsIds))
      .all();
  } else {
    const where = force
      ? sql`1 = 1`
      : eq(smsMessages.status, "pending");
    candidates = db.select().from(smsMessages).where(where).limit(limit).all();
  }

  if (candidates.length === 0) {
    return c.json({ processed: 0, enriched: 0, staleSkipped: 0, failed: 0 });
  }

  // The model needs the user's category list so the category_hint maps to a
  // real category. (We could narrow this per-user later; today there's only
  // one user.)
  const allCategories = db.select({ id: categories.id, name: categories.name }).from(categories).all();
  const knownPayees = db
    .select({
      id: payees.id,
      name: payees.name,
    })
    .from(payees)
    .all();

  let enriched = 0;
  let staleSkipped = 0;
  let failed = 0;

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const results = await reparseBatch(config, batch, allCategories, knownPayees);

    for (let j = 0; j < batch.length; j++) {
      const row = batch[j]!;
      const result = results[j];
      const at = nowMs();

      if (!result || !result.candidate) {
        // Mark failed so we don't loop on the same garbage on the next pass.
        db.update(smsMessages)
          .set({ status: "failed", enrichedAt: at, updatedAt: at })
          .where(eq(smsMessages.id, row.id))
          .run();
        failed++;
        continue;
      }

      const cand = result.candidate;

      // Persist the enriched candidate regardless of whether we apply it
      // to the txn — it's useful for "why didn't this row update?" debug.
      const enrichedJson = JSON.stringify(cand);

      // No linked txn → just store the enriched candidate for posterity.
      if (!row.linkedTransactionId) {
        db.update(smsMessages)
          .set({
            enrichedJson,
            status: "enriched",
            enrichedAt: at,
            updatedAt: at,
          })
          .where(eq(smsMessages.id, row.id))
          .run();
        enriched++;
        continue;
      }

      const txn = db
        .select()
        .from(transactions)
        .where(eq(transactions.id, row.linkedTransactionId))
        .get();

      // The txn might have been deleted on the phone. Skip safely.
      if (!txn) {
        db.update(smsMessages)
          .set({
            enrichedJson,
            status: "stale_skipped",
            enrichedAt: at,
            updatedAt: at,
          })
          .where(eq(smsMessages.id, row.id))
          .run();
        staleSkipped++;
        continue;
      }

      // Staleness check — respect manual edits made after confirm.
      if (
        !force &&
        row.baseTransactionUpdatedAt != null &&
        txn.updatedAt !== row.baseTransactionUpdatedAt
      ) {
        db.update(smsMessages)
          .set({
            enrichedJson,
            status: "stale_skipped",
            enrichedAt: at,
            updatedAt: at,
          })
          .where(eq(smsMessages.id, row.id))
          .run();
        staleSkipped++;
        continue;
      }

      // Resolve payee — create if it doesn't exist already (case-insensitive
      // lookup against the existing list we pulled at the top of this loop).
      let nextPayeeId = txn.payeeId;
      let nextPayeeName = txn.payeeName;
      if (cand.payee && validateCandidate(cand.payee) === null) {
        const existingPayee = knownPayees.find(
          (p) => p.name.toLowerCase() === cand.payee!.toLowerCase(),
        );
        if (existingPayee) {
          nextPayeeId = existingPayee.id;
          nextPayeeName = existingPayee.name;
        } else {
          const newPayeeId = newId();
          db.transaction((tx) => {
            tx.insert(payees)
              .values({
                id: newPayeeId,
                name: cand.payee!,
                useCount: 1,
                updatedAt: at,
              })
              .run();
            recordChange(tx, {
              resource: "payees",
              resourceId: newPayeeId,
              op: "upsert",
              payload: { id: newPayeeId, name: cand.payee, useCount: 1, updatedAt: at },
            });
          });
          knownPayees.push({ id: newPayeeId, name: cand.payee! });
          nextPayeeId = newPayeeId;
          nextPayeeName = cand.payee!;
        }
      }

      // Category — only set if the model produced an id (matched against
      // the supplied list). Keep existing otherwise.
      const nextCategoryId = cand.categoryId ?? txn.categoryId;

      const next = {
        ...txn,
        payeeId: nextPayeeId,
        payeeName: nextPayeeName,
        categoryId: nextCategoryId,
        updatedAt: at,
      };

      db.transaction((tx) => {
        tx.update(transactions).set(next).where(eq(transactions.id, txn.id)).run();
        recordChange(tx, {
          resource: "transactions",
          resourceId: txn.id,
          op: "upsert",
          payload: next,
        });
        tx.update(smsMessages)
          .set({
            enrichedJson,
            status: "enriched",
            enrichedAt: at,
            baseTransactionUpdatedAt: at,
            updatedAt: at,
          })
          .where(eq(smsMessages.id, row.id))
          .run();
      });
      enriched++;
    }
  }

  return c.json({
    processed: candidates.length,
    enriched,
    staleSkipped,
    failed,
  });
});

// Batch-call wrapper: hits the LLM once per group. If the call throws or the
// length doesn't match, falls back to single-row calls.
async function reparseBatch(
  config: import("../config.ts").AppConfig,
  batch: SmsMessage[],
  allCategories: { id: string; name: string }[],
  knownPayees: { id: string; name: string }[],
): Promise<(Awaited<ReturnType<typeof parseSms>> | null)[]> {
  // Today we still call parseSms() one-at-a-time but in a Promise.all so the
  // model handles them concurrently. A true batched single-call wire format
  // is a future optimisation; keeping per-row preserves the existing prompt
  // contract (and its retry/validation logic) without writing a parallel
  // batched-prompt path.
  const out = await Promise.allSettled(
    batch.map((row) =>
      parseSms(config, {
        sender: row.sender,
        body: row.body,
        receivedAt: row.receivedAt,
        categories: allCategories,
        payees: knownPayees,
      }),
    ),
  );
  return out.map((r) => (r.status === "fulfilled" ? r.value : null));
}
