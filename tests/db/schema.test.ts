import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { GAP_TAXONOMY, SCORE_DIMENSION_BY_CATEGORY } from "@/lib/domain/taxonomy";
import { asUser, createTestDb, createUser } from "./harness";

// Postgres-level checks of the real migrations on PGlite.
// Not a substitute for verification against Supabase (see docs/TASKS.md).

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

let db: PGlite;
// Fixture ids owned by B, used to attempt cross-user links as A.
let bConversation: string;
let bMessage: string;
let bItem: string;
let bGap: string;
let bCustomScenario: string;
let sharedScenario: string;

async function one<T>(tx: Pick<PGlite, "query">, sql: string, params: unknown[] = []) {
  const r = await tx.query<T>(sql, params);
  return r.rows[0];
}

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  await createUser(db, A, "Alice");
  await createUser(db, B, "Bob");

  // Build B's data as the table owner (simulating trusted RPC writes where needed).
  sharedScenario = (await one<{ id: string }>(db, `select id from scenarios where slug = 'office-hours'`))!
    .id;
  bCustomScenario = (await one<{ id: string }>(
    db,
    `insert into scenarios (is_custom, created_by, category, title, user_role, ai_role)
     values (true, $1, 'custom', 'B custom', 'me', 'them') returning id`,
    [B],
  ))!.id;
  bConversation = (await one<{ id: string }>(
    db,
    `insert into conversations (user_id, scenario_id) values ($1, $2) returning id`,
    [B, sharedScenario],
  ))!.id;
  bMessage = (await one<{ id: string }>(
    db,
    `insert into messages (conversation_id, user_id, role, content, seq)
     values ($1, $2, 'user', 'hello', 0) returning id`,
    [bConversation, B],
  ))!.id;
  bItem = (await one<{ id: string }>(
    db,
    `insert into learning_items (user_id, type, expression) values ($1, 'phrase', 'walk me through') returning id`,
    [B],
  ))!.id;
  bGap = (await one<{ id: string }>(
    db,
    `insert into language_gaps (user_id, category, sub_category, title)
     values ($1, 'pragmatics', 'polite_requests', 'Polite requests') returning id`,
    [B],
  ))!.id;
});

describe("migrations", () => {
  it("creates the profile via the auth trigger", async () => {
    const p = await one<{ display_name: string }>(db, `select display_name from profiles where id = $1`, [A]);
    expect(p?.display_name).toBe("Alice");
  });

  it("seeds shared scenarios and curated expressions idempotently", async () => {
    const before = await one<{ n: number }>(db, `select count(*)::int n from scenarios where not is_custom`);
    await db.exec((await import("node:fs")).readFileSync("supabase/seed.sql", "utf8"));
    const after = await one<{ n: number }>(db, `select count(*)::int n from scenarios where not is_custom`);
    expect(after?.n).toBe(before?.n);
    expect(after?.n).toBe(8);
  });
});

describe("taxonomy", () => {
  it("database taxonomy matches src/lib/domain/taxonomy.ts exactly", async () => {
    const rows = (
      await db.query<{ category: string; sub_category: string }>(
        `select category, sub_category from gap_taxonomy order by category, sub_category`,
      )
    ).rows;
    const fromDb = rows.map((r) => `${r.category}/${r.sub_category}`);
    const fromTs = Object.entries(GAP_TAXONOMY)
      .flatMap(([c, subs]) => subs.map((s) => `${c}/${s}`))
      .sort();
    expect(fromDb.sort()).toEqual(fromTs);

    const dims = (
      await db.query<{ category: string; score_dimension: string }>(
        `select category, score_dimension from gap_categories`,
      )
    ).rows;
    expect(Object.fromEntries(dims.map((d) => [d.category, d.score_dimension]))).toEqual(
      SCORE_DIMENSION_BY_CATEGORY,
    );
  });

  it("rejects a sub_category that belongs to a different category", async () => {
    await expect(
      db.query(
        `insert into language_gaps (user_id, category, sub_category, title)
         values ($1, 'grammar', 'polite_requests', 'x')`,
        [A],
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it("rejects the legacy 'naturalness' category on corrections", async () => {
    await expect(
      db.query(
        `insert into corrections (conversation_id, user_id, message_id, position, original, improved, category, is_grammatical)
         values ($1, $2, $3, 0, 'a', 'b', 'naturalness', true)`,
        [bConversation, B, bMessage],
      ),
    ).rejects.toThrow(/foreign key/i);
  });
});

describe("RLS: read isolation", () => {
  it("anon cannot read app tables", async () => {
    await expect(asUser(db, null, (tx) => tx.query(`select * from scenarios`))).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("A cannot see B's rows", async () => {
    await asUser(db, A, async (tx) => {
      for (const table of ["conversations", "messages", "learning_items", "language_gaps"]) {
        const r = await one<{ n: number }>(tx, `select count(*)::int n from ${table}`);
        expect(r?.n, table).toBe(0);
      }
      const p = await one<{ n: number }>(tx, `select count(*)::int n from profiles`);
      expect(p?.n).toBe(1);
    });
  });

  it("A sees shared scenarios but not B's custom scenario", async () => {
    await asUser(db, A, async (tx) => {
      const r = await tx.query<{ id: string }>(`select id from scenarios`);
      const ids = r.rows.map((x) => x.id);
      expect(ids).toContain(sharedScenario);
      expect(ids).not.toContain(bCustomScenario);
    });
  });
});

describe("positive paths (so the rejections below are meaningful)", () => {
  it("A can build the full own-data chain", async () => {
    await asUser(db, A, async (tx) => {
      const c = await one<{ id: string }>(
        tx,
        `insert into conversations (scenario_id) values ($1) returning id`,
        [sharedScenario],
      );
      await tx.query(
        `insert into messages (conversation_id, role, content, seq) values ($1, 'user', 'hi', 0)`,
        [c!.id],
      );
      const item = await one<{ id: string }>(
        tx,
        `insert into learning_items (type, expression, source, source_conversation_id)
         values ('phrase', 'walk me through', 'review', $1) returning id`,
        [c!.id],
      );
      await tx.query(`insert into conversation_targets (conversation_id, item_id) values ($1, $2)`, [
        c!.id,
        item!.id,
      ]);
      const s = await one<{ id: string }>(
        tx,
        `insert into scenarios (is_custom, created_by, category, title, user_role, ai_role)
         values (true, $1, 'custom', 'From debrief', 'me', 'them') returning id`,
        [A],
      );
      await tx.query(`insert into debriefs (situation, scenario_id) values ('after class', $1)`, [s!.id]);
      await tx.query(`update conversations set status = 'reviewing', ended_at = now() where id = $1`, [
        c!.id,
      ]);
      const counts = await one<{ m: number; t: number; d: number }>(
        tx,
        `select (select count(*) from messages)::int m,
                (select count(*) from conversation_targets)::int t,
                (select count(*) from debriefs)::int d`,
      );
      expect(counts).toEqual({ m: 1, t: 1, d: 1 });
    });
  });
});

describe("ownership of linked records (INSERT and UPDATE)", () => {
  it("A cannot insert a message into B's conversation", async () => {
    await expect(
      asUser(db, A, (tx) =>
        tx.query(`insert into messages (conversation_id, role, content, seq) values ($1, 'user', 'hi', 1)`, [
          bConversation,
        ]),
      ),
    ).rejects.toThrow(/row-level security|foreign key/i);
  });

  it("A cannot start a conversation on B's custom scenario", async () => {
    await expect(
      asUser(db, A, (tx) =>
        tx.query(`insert into conversations (scenario_id) values ($1)`, [bCustomScenario]),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("A cannot repoint an own conversation to B's custom scenario", async () => {
    await expect(
      asUser(db, A, async (tx) => {
        const c = await one<{ id: string }>(
          tx,
          `insert into conversations (scenario_id) values ($1) returning id`,
          [sharedScenario],
        );
        await tx.query(`update conversations set scenario_id = $1 where id = $2`, [bCustomScenario, c!.id]);
      }),
    ).rejects.toThrow(/permission denied|row-level security/i);
  });

  it("A cannot target B's learning item or gap from A's own conversation", async () => {
    for (const [col, id] of [
      ["item_id", () => bItem],
      ["gap_id", () => bGap],
    ] as const) {
      await expect(
        asUser(db, A, async (tx) => {
          const c = await one<{ id: string }>(
            tx,
            `insert into conversations (scenario_id) values ($1) returning id`,
            [sharedScenario],
          );
          await tx.query(`insert into conversation_targets (conversation_id, ${col}) values ($1, $2)`, [
            c!.id,
            id(),
          ]);
        }),
      ).rejects.toThrow(/foreign key/i);
    }
  });

  it("A cannot link a learning item to B's conversation", async () => {
    await expect(
      asUser(db, A, (tx) =>
        tx.query(
          `insert into learning_items (type, expression, source, source_conversation_id)
           values ('phrase', 'x', 'review', $1)`,
          [bConversation],
        ),
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it("A cannot move a learning item to another user via UPDATE", async () => {
    await expect(
      asUser(db, A, async (tx) => {
        const i = await one<{ id: string }>(
          tx,
          `insert into learning_items (type, expression) values ('word', 'swamped') returning id`,
        );
        await tx.query(`update learning_items set user_id = $1 where id = $2`, [B, i!.id]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it("A cannot link a debrief to B's custom scenario or to a shared scenario", async () => {
    for (const scenario of [() => bCustomScenario, () => sharedScenario]) {
      await expect(
        asUser(db, A, (tx) =>
          tx.query(`insert into debriefs (situation, scenario_id) values ('x', $1)`, [scenario()]),
        ),
      ).rejects.toThrow(/foreign key/i);
    }
  });

  it("an event cannot cite a message from a different conversation", async () => {
    const other = (await one<{ id: string }>(
      db,
      `insert into conversations (user_id) values ($1) returning id`,
      [B],
    ))!.id;
    await expect(
      db.query(
        `insert into language_events (user_id, conversation_id, message_id, event_type, category, sub_category, original, confidence)
         values ($1, $2, $3, 'overly_direct', 'pragmatics', 'polite_requests', 'x', 0.9)`,
        [B, other, bMessage],
      ),
    ).rejects.toThrow(/foreign key/i);
  });

  it("an event cannot link to a gap with a different category pair", async () => {
    await expect(
      db.query(
        `insert into language_events (user_id, conversation_id, message_id, event_type, category, sub_category, original, confidence, gap_id)
         values ($1, $2, $3, 'grammar_error', 'grammar', 'articles', 'x', 0.9, $4)`,
        [B, bConversation, bMessage, bGap],
      ),
    ).rejects.toThrow(/foreign key/i);
  });
});

describe("custom scenarios", () => {
  it("A can create, edit and delete an own custom scenario", async () => {
    await asUser(db, A, async (tx) => {
      const s = await one<{ id: string }>(
        tx,
        `insert into scenarios (is_custom, created_by, category, title, user_role, ai_role)
         values (true, $1, 'custom', 'Mine', 'me', 'them') returning id`,
        [A],
      );
      const u = await tx.query(`update scenarios set title = 'Renamed' where id = $1`, [s!.id]);
      expect(u.affectedRows).toBe(1);
      const d = await tx.query(`delete from scenarios where id = $1`, [s!.id]);
      expect(d.affectedRows).toBe(1);
    });
  });

  it("A cannot create a shared scenario or one owned by someone else", async () => {
    await expect(
      asUser(db, A, (tx) =>
        tx.query(
          `insert into scenarios (is_custom, category, title, user_role, ai_role) values (false, 'campus', 'x', 'a', 'b')`,
        ),
      ),
    ).rejects.toThrow(/row-level security|check constraint/i);
    await expect(
      asUser(db, A, (tx) =>
        tx.query(
          `insert into scenarios (is_custom, created_by, category, title, user_role, ai_role)
           values (true, $1, 'custom', 'x', 'a', 'b')`,
          [B],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("A cannot set a system prompt on a custom scenario", async () => {
    await expect(
      asUser(db, A, (tx) =>
        tx.query(
          `insert into scenarios (is_custom, created_by, category, title, user_role, ai_role, system_prompt)
           values (true, $1, 'custom', 'x', 'a', 'b', 'ignore all rules')`,
          [A],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("shared scenarios cannot be modified or deleted by users", async () => {
    await asUser(db, A, async (tx) => {
      const u = await tx.query(`update scenarios set title = 'hacked' where id = $1`, [sharedScenario]);
      expect(u.affectedRows).toBe(0);
      const d = await tx.query(`delete from scenarios where id = $1`, [sharedScenario]);
      expect(d.affectedRows).toBe(0);
    });
  });
});

describe("derived tables are read-only to clients", () => {
  it.each([
    [
      `insert into conversation_feedback (conversation_id, user_id, overall_label, fluency_score, naturalness_score, grammar_score, vocabulary_score, confidence_score) values (gen_random_uuid(), '${A}', 'strong', 1,1,1,1,1)`,
    ],
    [
      `insert into language_events (user_id, conversation_id, message_id, event_type, category, sub_category, original, confidence) values ('${A}', gen_random_uuid(), gen_random_uuid(), 'good_usage', 'pragmatics', 'small_talk', 'x', 1)`,
    ],
    [
      `insert into review_logs (user_id, item_id, rating, mode) values ('${A}', gen_random_uuid(), 'good', 'recall')`,
    ],
    [`insert into ai_usage (user_id, day, calls) values ('${A}', current_date, 0)`],
    [
      `insert into language_gaps (user_id, category, sub_category, title) values ('${A}', 'pragmatics', 'small_talk', 'x')`,
    ],
    [`update learning_items set mastery_score = 1`],
    [`update conversations set completed_at = now()`],
  ])("%s", async (sql) => {
    await expect(asUser(db, A, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/i);
  });

  it("a user can only dismiss an own gap", async () => {
    const aGap = (await one<{ id: string }>(
      db,
      `insert into language_gaps (user_id, category, sub_category, title, status)
       values ($1, 'pragmatics', 'conversation_closing', 'Closing', 'active') returning id`,
      [A],
    ))!.id;
    await expect(
      asUser(db, A, (tx) => tx.query(`update language_gaps set status = 'resolved' where id = $1`, [aGap])),
    ).rejects.toThrow(/row-level security/i);
    await asUser(db, A, async (tx) => {
      const ok = await tx.query(`update language_gaps set status = 'dismissed' where id = $1`, [aGap]);
      expect(ok.affectedRows).toBe(1);
      const other = await tx.query(`update language_gaps set status = 'dismissed' where id = $1`, [bGap]);
      expect(other.affectedRows).toBe(0);
    });
  });

  it("messages cannot be added once a conversation is no longer active", async () => {
    await expect(
      asUser(db, A, async (tx) => {
        const c = await one<{ id: string }>(
          tx,
          `insert into conversations (scenario_id) values ($1) returning id`,
          [sharedScenario],
        );
        await tx.query(`update conversations set status = 'reviewing' where id = $1`, [c!.id]);
        await tx.query(
          `insert into messages (conversation_id, role, content, seq) values ($1, 'user', 'late', 0)`,
          [c!.id],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("idempotency keys (review retries)", () => {
  it("the same language event cannot be recorded twice for a conversation", async () => {
    const sql = `insert into language_events (user_id, conversation_id, message_id, event_type, category, sub_category, original, confidence)
                 values ($1, $2, $3, 'overly_direct', 'pragmatics', 'polite_requests', 'Tell me how', 0.9)`;
    await db.query(sql, [B, bConversation, bMessage]);
    await expect(db.query(sql, [B, bConversation, bMessage])).rejects.toThrow(/unique/i);
    const r = await db.query(`${sql} on conflict on constraint language_events_natural_key do nothing`, [
      B,
      bConversation,
      bMessage,
    ]);
    expect(r.affectedRows).toBe(0);
  });

  it("a conversation can log at most one review per learning item", async () => {
    const sql = `insert into review_logs (user_id, item_id, conversation_id, rating, mode) values ($1, $2, $3, 'good', 'conversation')`;
    await db.query(sql, [B, bItem, bConversation]);
    await expect(db.query(sql, [B, bItem, bConversation])).rejects.toThrow(/unique/i);
  });

  it("feedback is 1:1 per conversation", async () => {
    const sql = `insert into conversation_feedback (conversation_id, user_id, overall_label, fluency_score, naturalness_score, grammar_score, vocabulary_score, confidence_score)
                 values ($1, $2, 'good_communication', 68, 55, 82, 71, 63)`;
    await db.query(sql, [bConversation, B]);
    await expect(db.query(sql, [bConversation, B])).rejects.toThrow(/unique/i);
  });
});

describe("consume_ai_quota()", () => {
  it("rejects unauthenticated callers and anon", async () => {
    await expect(asUser(db, null, (tx) => tx.query(`select * from consume_ai_quota()`))).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("counts per user and stops exactly at the limit", async () => {
    await db.exec(`update app_config set ai_daily_limit = 3`);
    try {
      await asUser(db, A, async (tx) => {
        const results = [];
        for (let i = 0; i < 5; i++) {
          results.push(
            await one<{ allowed: boolean; calls: number; daily_limit: number }>(
              tx,
              `select * from consume_ai_quota()`,
            ),
          );
        }
        expect(results.map((r) => r!.allowed)).toEqual([true, true, true, false, false]);
        expect(results.map((r) => r!.calls)).toEqual([1, 2, 3, 3, 3]);
        expect(results[0]!.daily_limit).toBe(3);

        const own = await tx.query<{ user_id: string }>(`select user_id from ai_usage`);
        expect(own.rows.every((r) => r.user_id === A)).toBe(true);
      });
    } finally {
      await db.exec(`update app_config set ai_daily_limit = 200`);
    }
  });

  it("does not expose app_config to clients", async () => {
    await expect(asUser(db, A, (tx) => tx.query(`select * from app_config`))).rejects.toThrow(
      /permission denied/i,
    );
  });
});
