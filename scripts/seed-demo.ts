/**
 * Creates (or resets) a demo account with realistic practice history, so every Today section
 * has data: completed conversations with feedback, gaps backed by language events, saved
 * items (some due), review logs and a debrief. Times are relative to now; rerun to refresh.
 *
 *   npm run db:seed-demo             create or reset the demo account, print its password
 *   npm run db:seed-demo -- --delete delete the demo account and all its rows
 *
 * Uses the service-role key (bypasses RLS), so it only writes rows owned by the demo user.
 * Needs the migrations and seed.sql applied (it uses the shared scenarios).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/types";

const DEMO_EMAIL = "fluentlab-demo@example.com";
const TIME_ZONE = "America/New_York";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceRoleKey) {
  console.error("Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const admin = createClient<Database>(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function fail(step: string, error: { message: string; code?: string } | null): void {
  if (error) throw new Error(`${step}: ${error.code ?? ""} ${error.message}`);
}

const now = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(now - ms).toISOString();
const ahead = (ms: number) => new Date(now + ms).toISOString();

async function findDemoUserId(): Promise<string | null> {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    fail("listUsers", error);
    const match = data.users.find((u) => u.email === DEMO_EMAIL);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
}

async function deleteDemoUser(): Promise<boolean> {
  const id = await findDemoUserId();
  if (!id) return false;
  // Profiles and every user-owned row cascade from auth.users.
  const { error } = await admin.auth.admin.deleteUser(id);
  fail("deleteUser", error);
  return true;
}

type Turn = { role: "assistant" | "user"; content: string };

const CONVERSATIONS: {
  slug: string;
  status: "completed" | "abandoned";
  startedAgo: number;
  score: number | null;
  feedback?: {
    label: "needs_work" | "developing" | "good_communication" | "strong";
    summary: string;
    scores: [fluency: number, naturalness: number, grammar: number, vocabulary: number, confidence: number];
    strengths: string[];
  };
  turns: Turn[];
}[] = [
  {
    slug: "office-hours",
    status: "completed",
    startedAgo: 40 * 60 * 1000,
    score: 68,
    feedback: {
      label: "developing",
      summary: "You explained your problem clearly. Some requests came across as more direct than you meant.",
      scores: [70, 61, 82, 66, 58],
      strengths: ["Explained the problem clearly", "Asked a good follow-up question"],
    },
    turns: [
      { role: "assistant", content: "Hey! Come on in. What can I help you with?" },
      { role: "user", content: "I don't understand question 3. Explain it again." },
      { role: "assistant", content: "Sure. Which part is confusing: the setup or the proof?" },
      { role: "user", content: "The proof. I disagree that step two follows, it's wrong." },
    ],
  },
  {
    slug: "group-project-disagreement",
    status: "completed",
    startedAgo: 1 * DAY + 2 * HOUR,
    score: 61,
    feedback: {
      label: "developing",
      summary: "You stood your ground, which is good. Softening how you disagree would make it land better.",
      scores: [64, 55, 78, 63, 60],
      strengths: ["Suggested a concrete alternative"],
    },
    turns: [
      { role: "assistant", content: "So I was thinking each of us just takes one section. Sound good?" },
      { role: "user", content: "No, this is not fair. You must split it by workload." },
      { role: "assistant", content: "Hmm, okay. What would that look like?" },
      { role: "user", content: "Okay. I go now. Bye." },
    ],
  },
  {
    slug: "coffee-shop-order",
    status: "completed",
    startedAgo: 3 * DAY + 5 * HOUR,
    score: 74,
    feedback: {
      label: "good_communication",
      summary: "Quick and clear under pressure. A couple of phrases sounded abrupt for a friendly barista.",
      scores: [76, 68, 80, 72, 71],
      strengths: ["Handled the follow-up question", "Kept up with the pace"],
    },
    turns: [
      { role: "assistant", content: "Hi there! What can I get started for you?" },
      { role: "user", content: "Give me a large latte with oat milk." },
      { role: "assistant", content: "You got it! Anything else for you today?" },
      { role: "user", content: "No. That's all, bye." },
    ],
  },
  {
    slug: "after-class-small-talk",
    status: "abandoned",
    startedAgo: 4 * DAY + 3 * HOUR,
    score: null,
    turns: [
      { role: "assistant", content: "Oh hey, did you get what she meant about the midterm?" },
      { role: "user", content: "Not really." },
    ],
  },
];

// Each event points at a user turn: [conversation index, user turn index (0 = first user turn)].
const GAPS: {
  category: string;
  subCategory: string;
  title: string;
  description: string;
  status: "emerging" | "active" | "improving";
  severity: "low" | "medium" | "high";
  eventType: Database["public"]["Tables"]["language_events"]["Insert"]["event_type"];
  suggestion: string;
  evidence: [conversation: number, userTurn: number][];
}[] = [
  {
    category: "pragmatics",
    subCategory: "polite_requests",
    title: "Overly direct requests",
    description: "Requests sound like commands in situations that call for a softer ask.",
    status: "active",
    severity: "high",
    eventType: "overly_direct",
    suggestion: "Could you walk me through it one more time?",
    evidence: [
      [0, 0],
      [0, 1],
      [1, 0],
      [2, 0],
    ],
  },
  {
    category: "pragmatics",
    subCategory: "conversation_closing",
    title: "Ending conversations smoothly",
    description: "Conversations end abruptly instead of with a short, friendly wrap-up.",
    status: "active",
    severity: "medium",
    eventType: "unnatural_expression",
    suggestion: "Thanks so much, I'll catch you later!",
    evidence: [
      [1, 1],
      [2, 1],
    ],
  },
  {
    category: "natural_expression",
    subCategory: "filler_and_softeners",
    title: "Softening disagreement",
    description: "Disagreement comes out as a flat verdict. Softeners keep it collaborative.",
    status: "improving",
    severity: "medium",
    eventType: "missed_opportunity",
    suggestion: "I see what you mean, but I'm not sure step two follows.",
    evidence: [
      [0, 1],
      [1, 0],
    ],
  },
  {
    category: "grammar",
    subCategory: "articles",
    title: "Articles (a / the)",
    description: "Occasional missing or extra articles.",
    status: "emerging",
    severity: "low",
    eventType: "grammar_error",
    suggestion: "Could I get a large latte?",
    evidence: [[2, 0]],
  },
];

const ITEMS: {
  type: "word" | "phrase" | "expression";
  expression: string;
  meaning: string;
  example: string;
  source: "review" | "studio";
  conversation?: number;
  dueIn: number; // ms; negative = already due
  reviews: number;
  mastery: number;
}[] = [
  {
    type: "expression",
    expression: "Could you walk me through it?",
    meaning: "A polite way to ask someone to explain step by step.",
    example: "Could you walk me through how you got this answer?",
    source: "review",
    conversation: 0,
    dueIn: -2 * HOUR,
    reviews: 1,
    mastery: 0.3,
  },
  {
    type: "expression",
    expression: "I see what you mean, but…",
    meaning: "Acknowledges the other view before disagreeing.",
    example: "I see what you mean, but I think we should split it by workload.",
    source: "review",
    conversation: 1,
    dueIn: -1 * DAY,
    reviews: 2,
    mastery: 0.4,
  },
  {
    type: "phrase",
    expression: "catch you later",
    meaning: "A casual, friendly way to say goodbye.",
    example: "Thanks for the help, catch you later!",
    source: "review",
    conversation: 2,
    dueIn: -3 * HOUR,
    reviews: 0,
    mastery: 0,
  },
  {
    type: "phrase",
    expression: "touch base",
    meaning: "To briefly check in with someone.",
    example: "Let's touch base after the lecture.",
    source: "studio",
    dueIn: 1 * DAY,
    reviews: 3,
    mastery: 0.6,
  },
  {
    type: "expression",
    expression: "Would it be possible to…?",
    meaning: "A softer way to make a request.",
    example: "Would it be possible to get an extension?",
    source: "studio",
    dueIn: 2 * DAY,
    reviews: 2,
    mastery: 0.5,
  },
  {
    type: "word",
    expression: "tentative",
    meaning: "Not certain or fixed; provisional.",
    example: "Our meeting time is tentative for now.",
    source: "studio",
    dueIn: 4 * DAY,
    reviews: 4,
    mastery: 0.8,
  },
  {
    type: "phrase",
    expression: "on the same page",
    meaning: "Agreeing about or understanding something in the same way.",
    example: "Just to make sure we're on the same page, we present on Friday?",
    source: "studio",
    dueIn: 6 * DAY,
    reviews: 3,
    mastery: 0.7,
  },
];

async function seed(userId: string) {
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      display_name: "Alex",
      native_language: "Spanish",
      english_level: "upper_intermediate",
      learning_goal: "Speak up in class and sound natural at office hours and career fairs.",
      contexts: ["campus", "career"],
      daily_goal_minutes: 20,
      timezone: TIME_ZONE,
      onboarded_at: ago(5 * DAY),
    })
    .eq("id", userId);
  fail("profile", profileError);

  const { data: scenarios, error: scenarioError } = await admin
    .from("scenarios")
    .select("id, slug, title, category, ai_role")
    .eq("is_custom", false);
  fail("scenarios", scenarioError);
  const bySlug = new Map((scenarios ?? []).map((s) => [s.slug, s]));

  const conversations = CONVERSATIONS.map((c) => {
    const scenario = bySlug.get(c.slug);
    if (!scenario) throw new Error(`Scenario "${c.slug}" not found. Apply supabase/seed.sql first.`);
    const startedAt = now - c.startedAgo;
    const endedAt = new Date(startedAt + 12 * 60 * 1000).toISOString();
    return {
      id: randomUUID(),
      spec: c,
      row: {
        user_id: userId,
        scenario_id: scenario.id,
        scenario_snapshot: {
          slug: scenario.slug,
          title: scenario.title,
          category: scenario.category,
          ai_role: scenario.ai_role,
        },
        status: c.status,
        started_at: new Date(startedAt).toISOString(),
        ended_at: endedAt,
        completed_at: c.status === "completed" ? endedAt : null,
        overall_score: c.score,
      },
    };
  });
  const { error: conversationError } = await admin
    .from("conversations")
    .insert(conversations.map((c) => ({ id: c.id, ...c.row })));
  fail("conversations", conversationError);

  // Messages; remember user turn ids so events can point at them.
  const userTurnIds: string[][] = [];
  const messages = conversations.flatMap((c, ci) => {
    userTurnIds[ci] = [];
    const startedAt = Date.parse(c.row.started_at);
    return c.spec.turns.map((turn, seq) => {
      const id = randomUUID();
      if (turn.role === "user") userTurnIds[ci]!.push(id);
      return {
        id,
        conversation_id: c.id,
        user_id: userId,
        role: turn.role,
        content: turn.content,
        seq,
        created_at: new Date(startedAt + seq * 60 * 1000).toISOString(),
      };
    });
  });
  const { error: messageError } = await admin.from("messages").insert(messages);
  fail("messages", messageError);

  const feedback = conversations.flatMap((c) => {
    const f = c.spec.feedback;
    if (!f || !c.row.completed_at) return [];
    const [fluency, naturalness, grammar, vocabulary, confidence] = f.scores;
    return [
      {
        conversation_id: c.id,
        user_id: userId,
        summary: f.summary,
        overall_label: f.label,
        fluency_score: fluency,
        naturalness_score: naturalness,
        grammar_score: grammar,
        vocabulary_score: vocabulary,
        confidence_score: confidence,
        strengths: f.strengths,
        model: "demo-seed",
        created_at: new Date(Date.parse(c.row.completed_at) + 60 * 1000).toISOString(),
      },
    ];
  });
  const { error: feedbackError } = await admin.from("conversation_feedback").insert(feedback);
  fail("conversation_feedback", feedbackError);

  // Gaps, with aggregates computed from the events inserted below (never made up).
  for (const gap of GAPS) {
    const evidence = gap.evidence.map(([ci, ui]) => {
      const messageId = userTurnIds[ci]?.[ui];
      const message = messages.find((m) => m.id === messageId);
      if (!message) throw new Error(`Gap "${gap.title}" points at a missing user turn [${ci}, ${ui}].`);
      return message;
    });
    const times = evidence.map((m) => m.created_at).sort();

    const { data: gapRow, error: gapError } = await admin
      .from("language_gaps")
      .insert({
        user_id: userId,
        category: gap.category,
        sub_category: gap.subCategory,
        title: gap.title,
        description: gap.description,
        status: gap.status,
        severity: gap.severity,
        confidence: 0.8,
        evidence_count: evidence.length,
        conversations_count: new Set(evidence.map((m) => m.conversation_id)).size,
        first_detected_at: times[0],
        last_detected_at: times.at(-1),
      })
      .select("id")
      .single();
    fail(`gap ${gap.title}`, gapError);

    const { error: eventError } = await admin.from("language_events").insert(
      evidence.map((m) => ({
        user_id: userId,
        conversation_id: m.conversation_id,
        message_id: m.id,
        event_type: gap.eventType,
        category: gap.category,
        sub_category: gap.subCategory,
        original: m.content,
        suggestion: gap.suggestion,
        confidence: 0.8,
        gap_id: gapRow!.id,
        created_at: m.created_at,
      })),
    );
    fail(`events ${gap.title}`, eventError);
  }

  const { data: items, error: itemError } = await admin
    .from("learning_items")
    .insert(
      ITEMS.map((item) => ({
        user_id: userId,
        type: item.type,
        expression: item.expression,
        meaning: item.meaning,
        example: item.example,
        source: item.source,
        source_conversation_id: item.conversation === undefined ? null : conversations[item.conversation]!.id,
        mastery_score: item.mastery,
        review_count: item.reviews,
        interval_days: item.reviews,
        next_review_at: item.dueIn < 0 ? ago(-item.dueIn) : ahead(item.dueIn),
        last_reviewed_at: item.reviews > 0 ? ago(2 * DAY) : null,
        created_at: ago(5 * DAY),
      })),
    )
    .select("id, review_count");
  fail("learning_items", itemError);

  // Review sessions two days ago (keeps the streak unbroken between conversations).
  const { error: reviewError } = await admin.from("review_logs").insert(
    (items ?? [])
      .filter((item) => item.review_count > 0)
      .map((item, i) => ({
        user_id: userId,
        item_id: item.id,
        rating: i % 3 === 0 ? ("hard" as const) : ("good" as const),
        mode: "recall" as const,
        created_at: ago(2 * DAY + i * 60 * 1000),
      })),
  );
  fail("review_logs", reviewError);

  const { error: debriefError } = await admin.from("debriefs").insert({
    user_id: userId,
    situation: "I asked my TA for an extension by email and got no reply. I'm not sure if I was too blunt.",
    what_user_said: "I need more time for the assignment. Please give me an extension.",
    created_at: ago(5 * DAY),
  });
  fail("debriefs", debriefError);
}

try {
  if (process.argv.includes("--delete")) {
    console.log((await deleteDemoUser()) ? `Deleted ${DEMO_EMAIL}.` : `No ${DEMO_EMAIL} account to delete.`);
  } else {
    const reset = await deleteDemoUser();
    const password = randomBytes(12).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { display_name: "Alex" },
    });
    fail("createUser", error);
    await seed(data.user!.id);
    console.log(`${reset ? "Reset" : "Created"} the demo account. Sign in at /login with:`);
    console.log(`  email:    ${DEMO_EMAIL}`);
    console.log(`  password: ${password}`);
    console.log(
      "This is a throwaway demo account; rerun to refresh its data, or pass --delete to remove it.",
    );
  }
} catch (error) {
  console.error("Seeding failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
