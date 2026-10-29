import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  REVIEW_RATINGS,
  scheduleReview,
  type ReviewRating,
  type ScheduleState,
} from "@/lib/domain/scheduling";
import { asUser, createTestDb, createUser } from "./harness";

// record_item_review() on PGlite: permissions, the concurrency guard, and that the SQL rules
// match src/lib/domain/scheduling.ts exactly.

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

type Tx = Pick<PGlite, "query" | "exec">;
type ReviewRow = {
  applied: boolean;
  review_count: number;
  interval_days: number;
  ease: number;
  mastery_score: number;
  next_review_at: Date;
};

let db: PGlite;
let aItem: string;
let bItem: string;

async function newItem(owner: string, expression: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into learning_items (user_id, type, expression) values ($1, 'phrase', $2) returning id`,
    [owner, expression],
  );
  return r.rows[0]!.id;
}

async function review(tx: Tx, item: string, rating: string, expected: number, mode = "recall") {
  const r = await tx.query<ReviewRow>(`select * from record_item_review($1, $2, $3, $4)`, [
    item,
    rating,
    mode,
    expected,
  ]);
  return r.rows[0]!;
}

async function itemState(tx: Tx, item: string) {
  const r = await tx.query<{ review_count: number; ease: number; next_review_at: Date }>(
    `select review_count, ease, next_review_at from learning_items where id = $1`,
    [item],
  );
  return r.rows[0]!;
}

beforeAll(async () => {
  db = await createTestDb();
  await createUser(db, A, "Alice");
  await createUser(db, B, "Bob");
  aItem = await newItem(A, "walk me through");
  bItem = await newItem(B, "touch base");
});

describe("record_item_review()", () => {
  it("rejects anon and callers without a user", async () => {
    await expect(asUser(db, null, (tx) => review(tx, aItem, "good", 0))).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("applies a review, logs it once and moves the schedule", async () => {
    await asUser(db, A, async (tx) => {
      const before = await itemState(tx, aItem);
      const row = await review(tx, aItem, "good", 0, "use_in_sentence");
      expect(row).toMatchObject({ applied: true, review_count: 1, interval_days: 1 });
      expect(row.next_review_at.getTime()).toBeGreaterThan(before.next_review_at.getTime());

      const logs = await tx.query<{ rating: string; mode: string; user_id: string }>(
        `select rating, mode, user_id from review_logs where item_id = $1`,
        [aItem],
      );
      expect(logs.rows).toEqual([{ rating: "good", mode: "use_in_sentence", user_id: A }]);
    });
  });

  it("ignores a stale or repeated submit (expected review count)", async () => {
    await asUser(db, A, async (tx) => {
      await review(tx, aItem, "good", 0);
      const repeat = await review(tx, aItem, "easy", 0);
      expect(repeat).toMatchObject({ applied: false, review_count: 1, interval_days: 1 });
      const logs = await tx.query(`select 1 from review_logs where item_id = $1`, [aItem]);
      expect(logs.rows).toHaveLength(1);
    });
  });

  it("treats another user's item as missing and leaves it alone", async () => {
    await expect(asUser(db, A, (tx) => review(tx, bItem, "easy", 0))).rejects.toThrow(/item not found/);
    expect((await itemState(db, bItem)).review_count).toBe(0);
  });

  it("rejects unknown ratings and modes, including 'conversation'", async () => {
    await expect(asUser(db, A, (tx) => review(tx, aItem, "perfect", 0))).rejects.toThrow(/invalid rating/);
    await expect(asUser(db, A, (tx) => review(tx, aItem, "good", 0, "conversation"))).rejects.toThrow(
      /invalid mode/,
    );
  });

  it("is the only way in: clients still can't write schedules or logs directly", async () => {
    await expect(
      asUser(db, A, (tx) => tx.query(`update learning_items set interval_days = 300 where id = $1`, [aItem])),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(db, A, (tx) =>
        tx.query(
          `insert into review_logs (user_id, item_id, rating, mode) values ($1, $2, 'easy', 'recall')`,
          [A, aItem],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("SQL and TypeScript scheduling agree", () => {
  // Every 3-rating sequence, plus long runs that reach the ease floor/ceiling and the interval cap.
  const sequences: ReviewRating[][] = [
    ...REVIEW_RATINGS.flatMap((a) => REVIEW_RATINGS.flatMap((b) => REVIEW_RATINGS.map((c) => [a, b, c]))),
    Array<ReviewRating>(12).fill("again"),
    Array<ReviewRating>(12).fill("easy"),
    Array<ReviewRating>(12).fill("hard"),
    ["good", "good", "hard", "good", "again", "good", "easy", "hard", "good", "good"],
    ["easy", "hard", "hard", "hard", "good", "easy", "again", "again", "good", "easy"],
  ];

  it(`matches on ${sequences.length} rating sequences`, async () => {
    const mismatches: string[] = [];
    await asUser(db, A, async (tx) => {
      const now = (await tx.query<{ now: Date }>(`select now()`)).rows[0]!.now;
      for (const sequence of sequences) {
        // A fresh item per sequence, as the owner would get from the column defaults.
        const item = (
          await tx.query<{ id: string }>(
            `insert into learning_items (type, expression) values ('phrase', $1) returning id`,
            [`seq ${sequence.join(" ")}`],
          )
        ).rows[0]!.id;

        let ts: ScheduleState = { ease: 2.5, intervalDays: 0, masteryScore: 0 };
        for (const [i, rating] of sequence.entries()) {
          const sql = await review(tx, item, rating, i);
          const expected = scheduleReview(ts, rating, now);
          const actual = {
            ease: Number(sql.ease.toFixed(2)),
            intervalDays: sql.interval_days,
            masteryScore: Number(sql.mastery_score.toFixed(2)),
            nextReviewAt: sql.next_review_at,
          };
          if (JSON.stringify(actual) !== JSON.stringify(expected)) {
            mismatches.push(
              `${sequence.join(",")} step ${i}: sql ${JSON.stringify(actual)} ts ${JSON.stringify(expected)}`,
            );
            break;
          }
          ts = expected;
        }
      }
    });
    expect(mismatches).toEqual([]);
  });
});
