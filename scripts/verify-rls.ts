/**
 * Checks RLS, column grants and same-owner FKs on a real Supabase project, through
 * PostgREST with real user JWTs (the PGlite tests only cover Postgres semantics).
 *
 * Creates two throwaway confirmed users with the service-role key, signs in as each
 * with the anon key, runs the checks, then deletes both users (their rows cascade).
 *
 *   npm run db:verify-rls
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
 * Never run it against a project whose data you can't afford to have test rows in briefly.
 */
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

type Client = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !anonKey || !serviceRoleKey) {
  console.error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
  process.exit(1);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin: Client = createClient<Database>(url, serviceRoleKey, options);

type User = { id: string; client: Client };

async function createUser(label: string): Promise<User> {
  const email = `rls-check-${label}-${randomBytes(6).toString("hex")}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`createUser ${label}: ${created.error.message}`);

  const client = createClient<Database>(url!, anonKey!, options);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`signIn ${label}: ${signedIn.error.message}`);
  return { id: created.data.user.id, client };
}

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}`, detail ?? "");
  }
}

// PostgREST returns a Postgres error code when a grant or policy refuses a write.
const DENIED = new Set(["42501"]);

async function run(a: User, b: User) {
  const anon: Client = createClient<Database>(url!, anonKey!, options);

  console.log("profiles");
  {
    const mine = await a.client.from("profiles").select("id");
    check("A sees exactly its own profile", mine.data?.length === 1 && mine.data[0]?.id === a.id, mine);

    const other = await a.client
      .from("profiles")
      .update({ display_name: "hijacked" })
      .eq("id", b.id)
      .select("id");
    check("A cannot update B's profile (0 rows)", !other.error && other.data?.length === 0, other);
    const bProfile = await b.client.from("profiles").select("display_name").single();
    check("B's profile is unchanged", bProfile.data?.display_name !== "hijacked", bProfile);

    const own = await a.client
      .from("profiles")
      .update({ display_name: "Checker A" })
      .eq("id", a.id)
      .select("id");
    check("A can update its own profile", !own.error && own.data?.length === 1, own);

    // created_at is not in the column grant.
    const ungranted = await a.client
      .from("profiles")
      .update({ created_at: new Date(0).toISOString() })
      .eq("id", a.id);
    check(
      "Column grant blocks profiles.created_at",
      DENIED.has(ungranted.error?.code ?? ""),
      ungranted.error,
    );
  }

  console.log("debriefs (user-owned table)");
  {
    const spoofed = await a.client.from("debriefs").insert({ user_id: b.id, situation: "spoof" });
    check("A cannot insert a row owned by B", DENIED.has(spoofed.error?.code ?? ""), spoofed.error);

    const inserted = await a.client
      .from("debriefs")
      .insert({ situation: "Ordering coffee" })
      .select("id")
      .single();
    check("A can insert its own row", !inserted.error && Boolean(inserted.data), inserted.error);
    const id = inserted.data?.id ?? "00000000-0000-0000-0000-000000000000";

    const seen = await b.client.from("debriefs").select("id").eq("id", id);
    check("B cannot see A's row", seen.data?.length === 0, seen);
    const updated = await b.client
      .from("debriefs")
      .update({ situation: "changed" })
      .eq("id", id)
      .select("id");
    check("B cannot update A's row (0 rows)", updated.data?.length === 0, updated);
    const deleted = await b.client.from("debriefs").delete().eq("id", id).select("id");
    check("B cannot delete A's row (0 rows)", deleted.data?.length === 0, deleted);
    const still = await a.client.from("debriefs").select("situation").eq("id", id).single();
    check("A's row is intact", still.data?.situation === "Ordering coffee", still);

    const moved = await a.client.from("debriefs").update({ user_id: b.id }).eq("id", id);
    check(
      "A cannot hand its row to B (user_id not updatable)",
      DENIED.has(moved.error?.code ?? ""),
      moved.error,
    );
  }

  console.log("learning_items");
  {
    const item = await a.client
      .from("learning_items")
      .insert({ type: "phrase", expression: "touch base" })
      .select("id")
      .single();
    check("A can save a learning item", !item.error, item.error);
    const seen = await b.client.from("learning_items").select("id");
    check("B sees none of A's learning items", seen.data?.length === 0, seen);

    // Spaced-repetition state is written only by RPCs.
    const srs = await a.client
      .from("learning_items")
      .update({ mastery_score: 1 })
      .eq("id", item.data?.id ?? "");
    check("Column grant blocks learning_items.mastery_score", DENIED.has(srs.error?.code ?? ""), srs.error);

    // Reviews go through record_item_review() only.
    const itemId = item.data?.id ?? "";
    const reviewArgs = { p_item_id: itemId, p_rating: "good", p_mode: "recall", p_expected_review_count: 0 };
    const own = await a.client.rpc("record_item_review", reviewArgs);
    check(
      "A can review its own item (review_count 1, interval 1 day)",
      own.data?.[0]?.applied === true && own.data[0].review_count === 1 && own.data[0].interval_days === 1,
      own,
    );
    const repeat = await a.client.rpc("record_item_review", reviewArgs);
    check("A repeated submit is ignored (applied = false)", repeat.data?.[0]?.applied === false, repeat);
    const logs = await a.client.from("review_logs").select("rating").eq("item_id", itemId);
    check("Exactly one review log was written", logs.data?.length === 1, logs);

    const foreign = await b.client.rpc("record_item_review", { ...reviewArgs, p_expected_review_count: 1 });
    check(
      "B cannot review A's item (not found)",
      foreign.error?.code === "P0002",
      foreign.error ?? foreign.data,
    );
    const forged = await a.client
      .from("review_logs")
      .insert({ item_id: itemId, user_id: a.id, rating: "easy", mode: "recall" });
    check("A cannot write review_logs directly", DENIED.has(forged.error?.code ?? ""), forged.error);
    const anonReview = await createClient<Database>(url!, anonKey!, options).rpc(
      "record_item_review",
      reviewArgs,
    );
    check("anon cannot call record_item_review", Boolean(anonReview.error), anonReview.data);
  }

  console.log("scenarios + same-owner FK");
  {
    const shared = await b.client.from("scenarios").select("id, is_custom");
    check(
      "B sees the shared seeded scenarios",
      (shared.data?.length ?? 0) > 0 && shared.data!.every((s) => !s.is_custom),
      shared.error ?? shared.data?.length,
    );

    const custom = await a.client
      .from("scenarios")
      .insert({
        category: "custom",
        title: "My lab meeting",
        user_role: "student",
        ai_role: "PI",
        is_custom: true,
        created_by: a.id,
      })
      .select("id")
      .single();
    check("A can create a custom scenario", !custom.error, custom.error);
    const scenarioId = custom.data?.id ?? "";

    const seen = await b.client.from("scenarios").select("id").eq("id", scenarioId);
    check("B cannot see A's custom scenario", seen.data?.length === 0, seen);
    const renamed = await b.client
      .from("scenarios")
      .update({ title: "taken" })
      .eq("id", scenarioId)
      .select("id");
    check(
      "B cannot edit A's custom scenario (0 rows)",
      !renamed.error && renamed.data?.length === 0,
      renamed,
    );
    const removed = await b.client.from("scenarios").delete().eq("id", scenarioId).select("id");
    check(
      "B cannot delete A's custom scenario (0 rows)",
      !removed.error && removed.data?.length === 0,
      removed,
    );
    const kept = await a.client.from("scenarios").select("title").eq("id", scenarioId).single();
    check("A's custom scenario is intact", kept.data?.title === "My lab meeting", kept);
    const sharedEdit = await a.client
      .from("scenarios")
      .update({ title: "hijacked" })
      .eq("slug", "office-hours")
      .select("id");
    check(
      "A cannot edit a shared scenario (0 rows)",
      !sharedEdit.error && sharedEdit.data?.length === 0,
      sharedEdit,
    );

    const forged = await a.client.from("scenarios").insert({
      category: "custom",
      title: "x",
      user_role: "x",
      ai_role: "x",
      is_custom: true,
      created_by: b.id,
    });
    check("A cannot create a scenario owned by B", DENIED.has(forged.error?.code ?? ""), forged.error);

    // Same-owner composite FK: B's debrief can't point at A's custom scenario.
    const crossFk = await b.client.from("debriefs").insert({ situation: "x", scenario_id: scenarioId });
    check("Same-owner FK rejects B → A's scenario", crossFk.error?.code === "23503", crossFk.error);
  }

  console.log("conversation review (M7)");
  {
    const conversation = await a.client.from("conversations").insert({}).select("id").single();
    check("A can start a conversation", !conversation.error, conversation.error);
    const conversationId = conversation.data?.id ?? "";
    const message = await a.client
      .from("messages")
      .insert({ conversation_id: conversationId, role: "user", seq: 0, content: "I want ask a question." })
      .select("id")
      .single();
    check("A can add a message while active", !message.error, message.error);
    const ended = await a.client
      .from("conversations")
      .update({ status: "reviewing", ended_at: new Date().toISOString() })
      .eq("id", conversationId)
      .select("id");
    check("A can end its conversation", !ended.error && ended.data?.length === 1, ended);

    const completed = await a.client
      .from("conversations")
      .update({ status: "completed" })
      .eq("id", conversationId);
    check("A cannot mark it completed directly", DENIED.has(completed.error?.code ?? ""), completed.error);
    const attempts = await a.client
      .from("conversations")
      .update({ review_attempts: 0 })
      .eq("id", conversationId);
    check("A cannot write review_attempts", DENIED.has(attempts.error?.code ?? ""), attempts.error);

    const bClaim = await b.client.rpc("claim_conversation_review", { p_conversation_id: conversationId });
    check("B cannot claim A's review", bClaim.error?.code === "P0002", bClaim.error ?? bClaim.data);
    const aClaim = await a.client.rpc("claim_conversation_review", { p_conversation_id: conversationId });
    check("A claims its review", aClaim.data === "claimed", aClaim.error ?? aClaim.data);

    const review = {
      model: "verify-rls",
      summary: "Check run.",
      overallLabel: "developing",
      scores: { fluency: 60, naturalness: 60, grammar: 60, vocabulary: 60, confidence: 60 },
      strengths: [],
      corrections: [
        {
          messageId: message.data?.id,
          original: "I want ask a question.",
          improved: "I wanted to ask a question.",
          category: "grammar",
          subCategory: "tenses",
          isGrammatical: false,
          explanation: "Check run.",
          saveableExpressions: [],
        },
      ],
      targetItemsUsed: [],
    };
    // M8: one high-confidence event activates the "Articles" gap straight away.
    const events = [
      {
        messageId: message.data?.id,
        eventType: "grammar_error",
        category: "grammar",
        subCategory: "articles",
        original: "I want ask a question.",
        suggestion: "I wanted to ask a question.",
        context: "Check run.",
        confidence: 0.9,
      },
    ];
    const args = { p_conversation_id: conversationId, p_review: review, p_events: events };
    const bApply = await b.client.rpc("apply_conversation_review", args);
    check(
      "B cannot apply a review to A's conversation",
      bApply.error?.code === "P0002",
      bApply.error ?? bApply.data,
    );
    const anonApply = await anon.rpc("apply_conversation_review", args);
    check("anon cannot apply a review", Boolean(anonApply.error), anonApply.data);
    const aApply = await a.client.rpc("apply_conversation_review", args);
    check("A applies its review", aApply.data === true, aApply.error ?? aApply.data);
    const replay = await a.client.rpc("apply_conversation_review", args);
    check("Replaying the review is a no-op", replay.data === false, replay.error ?? replay.data);

    const aCorrections = await a.client
      .from("corrections")
      .select("id")
      .eq("conversation_id", conversationId);
    check("A sees one correction", aCorrections.data?.length === 1, aCorrections);
    const bFeedback = await b.client
      .from("conversation_feedback")
      .select("id")
      .eq("conversation_id", conversationId);
    check("B cannot see A's feedback", bFeedback.data?.length === 0, bFeedback);
    const status = await a.client.from("conversations").select("status").eq("id", conversationId).single();
    check("A's conversation is completed", status.data?.status === "completed", status);

    console.log("gaps (M8)");
    const gap = await a.client
      .from("language_gaps")
      .select("id, title, status, evidence_count")
      .eq("sub_category", "articles")
      .single();
    check(
      "The review created an active 'Articles' gap with 1 evidence",
      gap.data?.title === "Articles" && gap.data.status === "active" && gap.data.evidence_count === 1,
      gap.error ?? gap.data,
    );
    const gapId = gap.data?.id ?? "";
    const aEvents = await a.client
      .from("language_events")
      .select("gap_id")
      .eq("conversation_id", conversationId);
    check("A sees its event, linked to the gap", aEvents.data?.[0]?.gap_id === gapId, aEvents);
    const bGaps = await b.client.from("language_gaps").select("id").eq("id", gapId);
    check("B cannot see A's gap", bGaps.data?.length === 0, bGaps);
    const bEvents = await b.client.from("language_events").select("id").eq("conversation_id", conversationId);
    check("B cannot see A's events", bEvents.data?.length === 0, bEvents);

    const forged = await a.client
      .from("language_gaps")
      .update({ status: "resolved" })
      .eq("id", gapId)
      .select("id");
    check("A cannot mark its gap resolved directly", Boolean(forged.error), forged.data);
    const counts = await a.client.from("language_gaps").update({ evidence_count: 0 }).eq("id", gapId);
    check("A cannot write gap aggregates", DENIED.has(counts.error?.code ?? ""), counts.error);
    const recompute = await a.client.rpc("recompute_language_gaps", { p_user_id: b.id });
    check("A cannot call the internal recompute", Boolean(recompute.error), recompute.data);

    const bDismiss = await b.client
      .from("language_gaps")
      .update({ status: "dismissed" })
      .eq("id", gapId)
      .select("id");
    check("B cannot dismiss A's gap (0 rows)", !bDismiss.error && bDismiss.data?.length === 0, bDismiss);
    const dismiss = await a.client
      .from("language_gaps")
      .update({ status: "dismissed" })
      .eq("id", gapId)
      .select("id");
    check("A can dismiss its gap", !dismiss.error && dismiss.data?.length === 1, dismiss);
    const bRestore = await b.client.rpc("restore_gap", { p_gap_id: gapId });
    check("B cannot restore A's gap", bRestore.error?.code === "P0002", bRestore.error ?? bRestore.data);
    const restore = await a.client.rpc("restore_gap", { p_gap_id: gapId });
    check("A restores its gap to active", restore.data === "active", restore.error ?? restore.data);
  }

  console.log("reference data");
  {
    const taxonomy = await a.client.from("gap_taxonomy").select("category, sub_category").limit(1);
    check("Signed-in users can read gap_taxonomy", (taxonomy.data?.length ?? 0) === 1, taxonomy.error);
  }

  console.log("ai quota");
  {
    const quota = await a.client.rpc("consume_ai_quota");
    const row = quota.data?.[0];
    check("A can consume its quota (calls = 1)", row?.allowed === true && row.calls === 1, quota);
    const aUsage = await a.client.from("ai_usage").select("user_id");
    check("A sees its own usage row", aUsage.data?.length === 1 && aUsage.data[0]?.user_id === a.id, aUsage);
    const bUsage = await b.client.from("ai_usage").select("user_id");
    check("B sees no usage rows", bUsage.data?.length === 0, bUsage);
  }

  console.log("anon (signed out)");
  {
    const profiles = await anon.from("profiles").select("id");
    check(
      "anon cannot read profiles",
      DENIED.has(profiles.error?.code ?? ""),
      profiles.error ?? profiles.data,
    );
    const rpc = await anon.rpc("consume_ai_quota");
    check("anon cannot call consume_ai_quota", Boolean(rpc.error), rpc.data);
  }
}

const users: User[] = [];
try {
  users.push(await createUser("a"), await createUser("b"));
  await run(users[0]!, users[1]!);
} catch (error) {
  failures += 1;
  console.error("Aborted:", error instanceof Error ? error.message : error);
} finally {
  for (const user of users) {
    await user.client.auth.signOut();
    const removed = await admin.auth.admin.deleteUser(user.id);
    if (removed.error) {
      failures += 1;
      console.error(
        `Cleanup failed for test user ${user.id}: ${removed.error.message}. Delete it in the dashboard.`,
      );
    }
  }
}

console.log(failures === 0 ? "\nAll RLS checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
