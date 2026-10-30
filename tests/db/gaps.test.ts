import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { EVENT_TYPES, recomputeGap, type EventType, type GapEvent, type GapStatus } from "@/lib/domain/gaps";
import type { GapSeverity } from "@/lib/domain/recommendations";
import { GAP_DETAILS, GAP_TAXONOMY } from "@/lib/domain/taxonomy";
import { asUser, createTestDb, createUser } from "./harness";

// M8 on PGlite: language events through apply_conversation_review, gap creation and recompute,
// dismiss/restore, and that recompute_language_gaps (SQL) agrees with src/lib/domain/gaps.ts.

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

type Tx = Pick<PGlite, "query" | "exec">;

let db: PGlite;
let conv: string;
let assistantMsg: string;
let msg1: string;
let msg2: string;
let bMsg: string;

async function insert(tx: Tx, sql: string, params: unknown[]): Promise<string> {
  return (await tx.query<{ id: string }>(`${sql} returning id`, params)).rows[0]!.id;
}
const conversation = (tx: Tx, owner: string, status: string, completedAt: Date | null = null) =>
  insert(tx, `insert into conversations (user_id, status, completed_at) values ($1, $2, $3)`, [
    owner,
    status,
    completedAt,
  ]);
const message = (tx: Tx, owner: string, conversationId: string, role: string, seq: number) =>
  insert(
    tx,
    `insert into messages (user_id, conversation_id, role, seq, content) values ($1, $2, $3, $4, $5)`,
    [owner, conversationId, role, seq, `message ${seq}`],
  );

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, A, "Alice");
  await createUser(db, B, "Bob");
  await createUser(db, C, "Carol");
  conv = await conversation(db, A, "reviewing");
  assistantMsg = await message(db, A, conv, "assistant", 0);
  msg1 = await message(db, A, conv, "user", 1);
  msg2 = await message(db, A, conv, "user", 3);
  const bConv = await conversation(db, B, "reviewing");
  bMsg = await message(db, B, bConv, "user", 0);
});

const REVIEW = {
  model: "mock",
  summary: "ok",
  overallLabel: "developing",
  scores: { fluency: 60, naturalness: 60, grammar: 60, vocabulary: 60, confidence: 60 },
  strengths: [],
  corrections: [],
  targetItemsUsed: [],
};

function event(
  messageId: string,
  eventType: EventType,
  category: string,
  subCategory: string,
  confidence: number,
) {
  return {
    messageId,
    eventType,
    category,
    subCategory,
    original: "I want ask",
    suggestion: eventType === "good_usage" ? null : "I wanted to ask",
    context: "Asking about homework",
    confidence,
  };
}

/** One review's events (message ids exist only after beforeAll, hence a function). */
const events = () => [
  event(msg1, "grammar_error", "grammar", "articles", 0.9),
  event(msg1, "overly_direct", "pragmatics", "polite_requests", 0.7),
  event(msg2, "good_usage", "pragmatics", "polite_requests", 0.8),
  event(msg2, "unnatural_expression", "natural_expression", "word_choice", 0.5),
];

const apply = async (tx: Tx, events: unknown) =>
  (
    await tx.query<{ r: boolean }>(`select apply_conversation_review($1, $2, $3) as r`, [
      conv,
      JSON.stringify(REVIEW),
      JSON.stringify(events),
    ])
  ).rows[0]!.r;

async function rejectsCleanly(tx: Tx, fn: () => Promise<unknown>, pattern: RegExp) {
  await tx.exec("savepoint attempt");
  await expect(fn()).rejects.toThrow(pattern);
  await tx.exec("rollback to savepoint attempt");
}

type GapRow = {
  id: string;
  sub_category: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  evidence_count: number;
  conversations_count: number;
};
const gaps = async (tx: Tx) =>
  (
    await tx.query<GapRow>(
      `select id, sub_category, title, description, status, severity, evidence_count, conversations_count
       from language_gaps order by sub_category`,
    )
  ).rows;

describe("gap taxonomy details", () => {
  it("match GAP_DETAILS in taxonomy.ts", async () => {
    const rows = await db.query<{ sub_category: string; title: string; description: string }>(
      `select sub_category, title, description from gap_taxonomy`,
    );
    expect(
      Object.fromEntries(
        rows.rows.map((r) => [r.sub_category, { title: r.title, description: r.description }]),
      ),
    ).toEqual(GAP_DETAILS);
  });
});

describe("apply_conversation_review() with language events", () => {
  it("stores events, creates their gaps with fixed titles and recomputes them", async () => {
    await asUser(db, A, async (tx) => {
      expect(await apply(tx, events())).toBe(true);
      const rows = await gaps(tx);
      expect(
        rows.map(({ sub_category, title, status, severity, evidence_count }) => ({
          sub_category,
          title,
          status,
          severity,
          evidence_count,
        })),
      ).toEqual([
        // One negative event at 0.9 (≥ 0.85): active straight away, low severity.
        { sub_category: "articles", title: "Articles", status: "active", severity: "low", evidence_count: 1 },
        // One ordinary negative event: emerging (hidden).
        {
          sub_category: "polite_requests",
          title: "Polite requests",
          status: "emerging",
          severity: "low",
          evidence_count: 1,
        },
        // Below the evidence threshold: stored, but no evidence.
        {
          sub_category: "word_choice",
          title: "Word choice",
          status: "emerging",
          severity: "low",
          evidence_count: 0,
        },
      ]);
      expect(rows[0]!.description).toBe(GAP_DETAILS.articles.description);

      const linked = await tx.query<{ n: number }>(
        `select count(*)::int as n from language_events where conversation_id = $1 and gap_id is not null`,
        [conv],
      );
      expect(linked.rows[0]!.n).toBe(4);
    });
  });

  it("doesn't double-count when the review is replayed", async () => {
    await asUser(db, A, async (tx) => {
      await apply(tx, events());
      expect(await apply(tx, events())).toBe(false);
      const n = await tx.query<{ n: number }>(`select count(*)::int as n from language_events`);
      expect(n.rows[0]!.n).toBe(4);
      expect((await gaps(tx)).find((g) => g.sub_category === "articles")?.evidence_count).toBe(1);
    });
  });

  it("rejects events that don't point at the learner's own message, writing nothing", async () => {
    await asUser(db, A, async (tx) => {
      for (const messageId of [assistantMsg, bMsg]) {
        await rejectsCleanly(
          tx,
          () => apply(tx, [{ ...events()[0], messageId }]),
          /language event does not point at a learner message/,
        );
      }
      expect(await gaps(tx)).toEqual([]);
    });
  });

  it("rejects invalid pairs, unknown event types, bad confidence and too many events", async () => {
    const valid = () => events()[0]!;
    await asUser(db, A, async (tx) => {
      await rejectsCleanly(tx, () => apply(tx, [{ ...valid(), subCategory: "idioms" }]), /foreign key/);
      await rejectsCleanly(tx, () => apply(tx, [{ ...valid(), eventType: "typo" }]), /check constraint/);
      await rejectsCleanly(tx, () => apply(tx, [{ ...valid(), confidence: 1.5 }]), /check constraint/);
      await rejectsCleanly(tx, () => apply(tx, Array(61).fill(valid())), /too many language events/);
      expect(await gaps(tx)).toEqual([]);
    });
  });

  it("keeps a dismissed gap dismissed when new evidence arrives, and restores it on request", async () => {
    await asUser(db, A, async (tx) => {
      await apply(tx, events());
      const articles = (await gaps(tx)).find((g) => g.sub_category === "articles")!;
      await tx.query(`update language_gaps set status = 'dismissed' where id = $1`, [articles.id]);

      // A second reviewed conversation with more evidence for the same gap.
      await tx.exec("reset role");
      const second = await conversation(tx, A, "reviewing");
      const m = await message(tx, A, second, "user", 1);
      await tx.exec("set local role authenticated");
      await tx.query(`select apply_conversation_review($1, $2, $3)`, [
        second,
        JSON.stringify(REVIEW),
        JSON.stringify([event(m, "grammar_error", "grammar", "articles", 0.7)]),
      ]);
      const dismissed = (await gaps(tx)).find((g) => g.id === articles.id)!;
      expect(dismissed).toMatchObject({ status: "dismissed", evidence_count: 2, conversations_count: 2 });

      const restored = await tx.query<{ status: string }>(`select restore_gap($1) as status`, [articles.id]);
      expect(restored.rows[0]!.status).toBe("active");
    });
  });

  it("lets clients only dismiss, and keeps recompute and other users' gaps out of reach", async () => {
    let gapId = "";
    await asUser(db, A, async (tx) => {
      await apply(tx, events());
      gapId = (await gaps(tx)).find((g) => g.sub_category === "articles")!.id;
      await rejectsCleanly(
        tx,
        () => tx.query(`update language_gaps set status = 'resolved' where id = $1`, [gapId]),
        /row-level security/,
      );
      await rejectsCleanly(
        tx,
        () => tx.query(`update language_gaps set evidence_count = 0 where id = $1`, [gapId]),
        /permission denied/,
      );
      await rejectsCleanly(
        tx,
        () => tx.query(`select recompute_language_gaps($1)`, [A]),
        /permission denied/,
      );
      await rejectsCleanly(
        tx,
        () =>
          tx.query(
            `insert into language_events (user_id, conversation_id, message_id, event_type, category, sub_category, original, confidence)
             values ($1, $2, $3, 'grammar_error', 'grammar', 'articles', 'x', 0.9)`,
            [A, conv, msg1],
          ),
        /permission denied/,
      );
    });
    // Gap ids from a rolled-back transaction don't exist; another user's or a missing gap look the same.
    await expect(asUser(db, B, (tx) => tx.query(`select restore_gap($1)`, [gapId]))).rejects.toThrow(
      /gap not found/,
    );
  });
});

/** Small deterministic PRNG (mulberry32), so a failing history can be reproduced. */
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("SQL and TypeScript gap rules agree", () => {
  const ROUNDS = 12;
  const PAIRS = Object.entries(GAP_TAXONOMY).flatMap(([category, subs]) =>
    subs.map((sub) => [category, sub] as const),
  );
  const CONFIDENCES = [0.3, 0.59, 0.6, 0.7, 0.84, 0.85, 0.95];
  const SEVERITIES: GapSeverity[] = ["low", "medium", "high"];
  const DAY = 24 * 60 * 60 * 1000;

  it(`matches on ${ROUNDS * PAIRS.length} random gap histories`, async () => {
    const random = prng(20261029);
    const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
    const mismatches: string[] = [];
    const seen = new Set<string>();

    for (let round = 0; round < ROUNDS; round++) {
      await db.exec("begin");
      try {
        const now = (await db.query<{ now: Date }>(`select now()`)).rows[0]!.now;
        const ago = () => new Date(now.getTime() - Math.floor(random() * 60 * DAY));

        // Conversations the events come from, each with a few learner messages.
        const pool: { id: string; messages: string[] }[] = [];
        for (let i = 0; i < 6; i++) {
          const id = await conversation(db, C, "completed", now);
          const messages = [];
          for (let seq = 0; seq < 8; seq++) messages.push(await message(db, C, id, "user", seq));
          pool.push({ id, messages });
        }
        // Completed conversations that may target gaps.
        const targeted: { id: string; completedAt: Date }[] = [];
        for (let i = 0; i < 5; i++) {
          const completedAt = ago();
          targeted.push({ id: await conversation(db, C, "completed", completedAt), completedAt });
        }

        const expected = new Map<string, ReturnType<typeof recomputeGap>>();
        for (const [category, sub] of PAIRS) {
          const dismissed = random() < 0.1;
          const previousSeverity = pick(SEVERITIES);
          const gapId = await insert(
            db,
            `insert into language_gaps (user_id, category, sub_category, title, status, severity)
             values ($1, $2, $3, $3, $4, $5)`,
            [C, category, sub, dismissed ? "dismissed" : "emerging", previousSeverity],
          );

          const history: GapEvent[] = [];
          const used = new Set<string>();
          const count = Math.floor(random() * 11);
          for (let i = 0; i < count; i++) {
            const source = pick(pool);
            const messageId = pick(source.messages);
            const eventType: EventType =
              random() < 0.3 ? "good_usage" : pick(EVENT_TYPES.filter((t) => t !== "good_usage"));
            const key = `${messageId}:${eventType}`;
            if (used.has(key)) continue; // the natural key allows one per message and type
            used.add(key);
            const confidence = pick(CONFIDENCES);
            const createdAt = ago();
            await db.query(
              `insert into language_events (user_id, conversation_id, message_id, event_type, category, sub_category,
                 original, confidence, gap_id, created_at)
               values ($1, $2, $3, $4, $5, $6, 'x', $7, $8, $9)`,
              [C, source.id, messageId, eventType, category, sub, confidence, gapId, createdAt],
            );
            history.push({ eventType, confidence, conversationId: source.id, createdAt });
          }

          const completions: Date[] = [];
          for (const t of targeted) {
            if (random() < 0.4) {
              await db.query(
                `insert into conversation_targets (user_id, conversation_id, gap_id) values ($1, $2, $3)`,
                [C, t.id, gapId],
              );
              completions.push(t.completedAt);
            }
          }
          expected.set(
            gapId,
            recomputeGap({
              events: history,
              targetedCompletions: completions,
              dismissed,
              previousSeverity,
              now,
            }),
          );
        }

        await db.query(`select recompute_language_gaps($1)`, [C]);
        const rows = await db.query<{
          id: string;
          sub_category: string;
          status: GapStatus;
          severity: GapSeverity;
          evidence_count: number;
          conversations_count: number;
          confidence: number;
          first_detected_at: Date | null;
          last_detected_at: Date | null;
        }>(
          `select id, sub_category, status, severity, evidence_count, conversations_count, confidence,
                  first_detected_at, last_detected_at
           from language_gaps where user_id = $1`,
          [C],
        );
        for (const row of rows.rows) {
          const want = expected.get(row.id)!;
          seen.add(want.status);
          seen.add(`severity:${want.severity}`);
          const got = {
            status: row.status,
            severity: row.severity,
            evidenceCount: row.evidence_count,
            conversationsCount: row.conversations_count,
            confidence: Number(row.confidence.toFixed(2)),
            firstDetectedAt: row.first_detected_at,
            lastDetectedAt: row.last_detected_at,
          };
          if (JSON.stringify(got) !== JSON.stringify(want)) {
            mismatches.push(
              `round ${round} ${row.sub_category}: sql ${JSON.stringify(got)} ts ${JSON.stringify(want)}`,
            );
          }
        }
      } finally {
        await db.exec("rollback");
      }
    }
    expect(mismatches).toEqual([]);
    // The histories are only a useful check if they reach every outcome.
    expect([...seen].sort()).toEqual([
      "active",
      "dismissed",
      "emerging",
      "improving",
      "resolved",
      "severity:high",
      "severity:low",
      "severity:medium",
    ]);
  });
});
