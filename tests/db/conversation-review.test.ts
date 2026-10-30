import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { scheduleReview } from "@/lib/domain/scheduling";
import { asUser, createTestDb, createUser } from "./harness";

// claim_conversation_review() and apply_conversation_review() on PGlite: ownership, the
// single-writer/no-op replay rules, Reuse scheduling, and the client status guard.

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

type Tx = Pick<PGlite, "query" | "exec">;

let db: PGlite;
// A's conversation in `reviewing` with an opening line, two learner messages and two targets.
let conv: string;
let assistantMsg: string;
let userMsg1: string;
let userMsg2: string;
let usedItem: string;
let unusedItem: string;
let otherItem: string;
let activeConv: string;
let bConv: string;
let bMsg: string;

async function insert(sql: string, params: unknown[]): Promise<string> {
  return (await db.query<{ id: string }>(`${sql} returning id`, params)).rows[0]!.id;
}

const conversation = (owner: string, status: string) =>
  insert(`insert into conversations (user_id, status) values ($1, $2)`, [owner, status]);
const message = (owner: string, conversationId: string, role: string, seq: number, content: string) =>
  insert(`insert into messages (user_id, conversation_id, role, seq, content) values ($1, $2, $3, $4, $5)`, [
    owner,
    conversationId,
    role,
    seq,
    content,
  ]);
const item = (owner: string, expression: string) =>
  insert(`insert into learning_items (user_id, type, expression) values ($1, 'phrase', $2)`, [
    owner,
    expression,
  ]);

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, A, "Alice");
  await createUser(db, B, "Bob");

  conv = await conversation(A, "reviewing");
  assistantMsg = await message(A, conv, "assistant", 0, "Hey! Come on in.");
  userMsg1 = await message(A, conv, "user", 1, "I want ask about the homework.");
  await message(A, conv, "assistant", 2, "Sure, which part?");
  userMsg2 = await message(A, conv, "user", 3, "Could you walk me through question 3?");
  usedItem = await item(A, "walk me through");
  unusedItem = await item(A, "touch base");
  otherItem = await item(A, "circle back");
  for (const target of [usedItem, unusedItem]) {
    await db.query(
      `insert into conversation_targets (user_id, conversation_id, item_id) values ($1, $2, $3)`,
      [A, conv, target],
    );
  }
  activeConv = await conversation(A, "active");

  bConv = await conversation(B, "reviewing");
  bMsg = await message(B, bConv, "user", 0, "Bob's message");
});

function reviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    model: "mock",
    summary: "You got your question across clearly.",
    overallLabel: "developing",
    scores: { fluency: 70, naturalness: 60, grammar: 64, vocabulary: 72, confidence: 80 },
    strengths: ["Polite opening", "Clear question"],
    corrections: [
      {
        messageId: userMsg1,
        original: "I want ask about the homework.",
        improved: "I wanted to ask about the homework.",
        category: "grammar",
        subCategory: "tenses",
        isGrammatical: false,
        explanation: "'want' needs 'to' before a verb; the past tense sounds softer.",
        saveableExpressions: [
          { expression: "I wanted to ask about…", meaning: "a soft way to raise a topic" },
        ],
      },
      {
        messageId: userMsg2,
        original: "Could you walk me through question 3?",
        improved: "Would you mind walking me through question 3?",
        category: "pragmatics",
        subCategory: null,
        isGrammatical: true,
        explanation: "Already polite; this is a slightly softer option.",
        saveableExpressions: [],
      },
    ],
    targetItemsUsed: [
      { itemId: usedItem, usedNaturally: true },
      { itemId: unusedItem, usedNaturally: false },
      { itemId: otherItem, usedNaturally: true }, // not a target of this conversation
    ],
    ...overrides,
  };
}

const claim = async (tx: Tx, id: string) =>
  (await tx.query<{ r: string }>(`select claim_conversation_review($1) as r`, [id])).rows[0]!.r;
const apply = async (tx: Tx, id: string, review: unknown, events: unknown = []) =>
  (
    await tx.query<{ r: boolean }>(`select apply_conversation_review($1, $2, $3) as r`, [
      id,
      JSON.stringify(review),
      JSON.stringify(events),
    ])
  ).rows[0]!.r;

/** Run `fn` and expect it to fail without leaving anything behind in the open transaction. */
async function rejectsCleanly(tx: Tx, fn: () => Promise<unknown>, pattern: RegExp) {
  await tx.exec("savepoint attempt");
  await expect(fn()).rejects.toThrow(pattern);
  await tx.exec("rollback to savepoint attempt");
}

const count = async (tx: Tx, table: string, conversationId: string) =>
  (await tx.query(`select 1 from ${table} where conversation_id = $1`, [conversationId])).rows.length;

describe("claim_conversation_review()", () => {
  it("rejects anon", async () => {
    await expect(asUser(db, null, (tx) => claim(tx, conv))).rejects.toThrow(/permission denied/i);
  });

  it("claims an ended conversation once, then reports it in progress", async () => {
    await asUser(db, A, async (tx) => {
      expect(await claim(tx, conv)).toBe("claimed");
      expect(await claim(tx, conv)).toBe("in_progress");
      const row = await tx.query<{ review_attempts: number; review_started_at: Date | null }>(
        `select review_attempts, review_started_at from conversations where id = $1`,
        [conv],
      );
      expect(row.rows[0]).toMatchObject({ review_attempts: 1 });
      expect(row.rows[0]!.review_started_at).not.toBeNull();
    });
  });

  it("reclaims a stale attempt and a failed review", async () => {
    await asUser(db, A, async (tx) => {
      await claim(tx, conv);
      await tx.exec("reset role");
      await tx.query(
        `update conversations set review_started_at = now() - interval '6 minutes' where id = $1`,
        [conv],
      );
      await tx.exec("set local role authenticated");
      expect(await claim(tx, conv)).toBe("claimed");

      await tx.query(
        `update conversations set status = 'failed_review', review_error = 'timeout' where id = $1`,
        [conv],
      );
      expect(await claim(tx, conv)).toBe("claimed");
      const row = await tx.query(
        `select status, review_attempts, review_error from conversations where id = $1`,
        [conv],
      );
      expect(row.rows[0]).toEqual({ status: "reviewing", review_attempts: 3, review_error: null });
    });
  });

  it("doesn't claim active conversations, and treats another user's as missing", async () => {
    await asUser(db, A, async (tx) => {
      expect(await claim(tx, activeConv)).toBe("active");
    });
    await expect(asUser(db, A, (tx) => claim(tx, bConv))).rejects.toThrow(/conversation not found/);
  });
});

describe("apply_conversation_review()", () => {
  it("rejects anon and another user's conversation", async () => {
    await expect(asUser(db, null, (tx) => apply(tx, conv, reviewPayload()))).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asUser(db, B, (tx) => apply(tx, conv, reviewPayload()))).rejects.toThrow(
      /conversation not found/,
    );
  });

  it("writes feedback, corrections, target usage and completes the conversation", async () => {
    await asUser(db, A, async (tx) => {
      const before = (
        await tx.query<{ ease: number; interval_days: number; mastery_score: number }>(
          `select ease, interval_days, mastery_score from learning_items where id = $1`,
          [usedItem],
        )
      ).rows[0]!;
      const now = (await tx.query<{ now: Date }>(`select now()`)).rows[0]!.now;

      expect(await apply(tx, conv, reviewPayload())).toBe(true);

      const feedback = await tx.query(
        `select user_id, overall_label, fluency_score, confidence_score, strengths, model
         from conversation_feedback where conversation_id = $1`,
        [conv],
      );
      expect(feedback.rows).toEqual([
        {
          user_id: A,
          overall_label: "developing",
          fluency_score: 70,
          confidence_score: 80,
          strengths: ["Polite opening", "Clear question"],
          model: "mock",
        },
      ]);

      const corrections = await tx.query(
        `select position, message_id, category, sub_category, is_grammatical, saveable_expressions
         from corrections where conversation_id = $1 order by position`,
        [conv],
      );
      expect(corrections.rows).toEqual([
        {
          position: 0,
          message_id: userMsg1,
          category: "grammar",
          sub_category: "tenses",
          is_grammatical: false,
          saveable_expressions: [
            { expression: "I wanted to ask about…", meaning: "a soft way to raise a topic" },
          ],
        },
        {
          position: 1,
          message_id: userMsg2,
          category: "pragmatics",
          sub_category: null,
          is_grammatical: true,
          saveable_expressions: [],
        },
      ]);

      const targets = await tx.query(
        `select item_id, used_naturally from conversation_targets where conversation_id = $1 order by used_naturally`,
        [conv],
      );
      expect(targets.rows).toEqual([
        { item_id: unusedItem, used_naturally: false },
        { item_id: usedItem, used_naturally: true },
      ]);

      // Only the naturally used target moved, once, by the same 'good' rule as a review session.
      const logs = await tx.query(
        `select item_id, rating, mode from review_logs where conversation_id = $1`,
        [conv],
      );
      expect(logs.rows).toEqual([{ item_id: usedItem, rating: "good", mode: "conversation" }]);
      const expected = scheduleReview(
        { ease: before.ease, intervalDays: before.interval_days, masteryScore: before.mastery_score },
        "good",
        now,
      );
      const after = (
        await tx.query<{
          ease: number;
          interval_days: number;
          mastery_score: number;
          review_count: number;
          next_review_at: Date;
        }>(
          `select ease, interval_days, mastery_score, review_count, next_review_at from learning_items where id = $1`,
          [usedItem],
        )
      ).rows[0]!;
      expect({
        ease: Number(after.ease.toFixed(2)),
        intervalDays: after.interval_days,
        masteryScore: Number(after.mastery_score.toFixed(2)),
        nextReviewAt: after.next_review_at,
      }).toEqual(expected);
      expect(after.review_count).toBe(1);
      for (const untouched of [unusedItem, otherItem]) {
        const row = await tx.query(`select review_count from learning_items where id = $1`, [untouched]);
        expect(row.rows[0]).toEqual({ review_count: 0 });
      }

      const status = await tx.query(
        `select status, overall_score, completed_at from conversations where id = $1`,
        [conv],
      );
      expect(status.rows[0]).toMatchObject({ status: "completed", overall_score: 69 });
    });
  });

  it("is a no-op when replayed after completion", async () => {
    await asUser(db, A, async (tx) => {
      expect(await apply(tx, conv, reviewPayload())).toBe(true);
      expect(await apply(tx, conv, reviewPayload({ summary: "different" }))).toBe(false);
      expect(await count(tx, "conversation_feedback", conv)).toBe(1);
      expect(await count(tx, "corrections", conv)).toBe(2);
      expect(await count(tx, "review_logs", conv)).toBe(1);
      const row = await tx.query(`select review_count from learning_items where id = $1`, [usedItem]);
      expect(row.rows[0]).toEqual({ review_count: 1 });
    });
  });

  it("rejects corrections that don't point at the learner's own message, writing nothing", async () => {
    const at = (messageId: string) =>
      reviewPayload({ corrections: [{ ...reviewPayload().corrections[0], messageId }] });
    await asUser(db, A, async (tx) => {
      for (const messageId of [assistantMsg, bMsg]) {
        await rejectsCleanly(tx, () => apply(tx, conv, at(messageId)), /learner message/);
      }
      expect(await count(tx, "conversation_feedback", conv)).toBe(0);
      const status = await tx.query(`select status from conversations where id = $1`, [conv]);
      expect(status.rows[0]).toEqual({ status: "reviewing" });
    });
  });

  it("rejects bad payloads and conversations that aren't being reviewed", async () => {
    const correction = reviewPayload().corrections[0]!;
    await asUser(db, A, async (tx) => {
      await rejectsCleanly(tx, () => apply(tx, activeConv, reviewPayload()), /not being reviewed/);
      await rejectsCleanly(tx, () => apply(tx, conv, reviewPayload(), {}), /invalid review payload/);
      await rejectsCleanly(tx, () => apply(tx, conv, { summary: "no scores" }), /invalid review payload/);
      await rejectsCleanly(
        tx,
        () => apply(tx, conv, reviewPayload({ corrections: Array(9).fill(correction) })),
        /too many corrections/,
      );
      // Category/sub-category must be a valid taxonomy pair (composite FK).
      await rejectsCleanly(
        tx,
        () => apply(tx, conv, reviewPayload({ corrections: [{ ...correction, subCategory: "idioms" }] })),
        /foreign key/,
      );
      await rejectsCleanly(
        tx,
        () => apply(tx, conv, reviewPayload({ scores: { ...reviewPayload().scores, grammar: 101 } })),
        /check constraint/,
      );
    });
  });
});

describe("client status changes", () => {
  const setStatus = (tx: Tx, id: string, status: string) =>
    tx.query(`update conversations set status = $2 where id = $1`, [id, status]);

  it("allows ending, abandoning and failing a review", async () => {
    await asUser(db, A, async (tx) => {
      await setStatus(tx, activeConv, "reviewing");
      await setStatus(tx, conv, "failed_review");
    });
    await asUser(db, A, (tx) => setStatus(tx, activeConv, "abandoned"));
  });

  it("can't complete, reopen or retry directly", async () => {
    await expect(asUser(db, A, (tx) => setStatus(tx, conv, "completed"))).rejects.toThrow(/cannot change/);
    await expect(asUser(db, A, (tx) => setStatus(tx, conv, "active"))).rejects.toThrow(/cannot change/);
    await expect(
      asUser(db, A, async (tx) => {
        await setStatus(tx, conv, "failed_review");
        await setStatus(tx, conv, "reviewing");
      }),
    ).rejects.toThrow(/cannot change/);
  });

  it("can't write review bookkeeping columns or results", async () => {
    await expect(
      asUser(db, A, (tx) => tx.query(`update conversations set review_attempts = 0 where id = $1`, [conv])),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(db, A, (tx) => tx.query(`update conversations set overall_score = 100 where id = $1`, [conv])),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(db, A, (tx) =>
        tx.query(
          `insert into conversation_feedback (conversation_id, user_id, overall_label, fluency_score,
             naturalness_score, grammar_score, vocabulary_score, confidence_score)
           values ($1, $2, 'strong', 100, 100, 100, 100, 100)`,
          [conv, A],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
