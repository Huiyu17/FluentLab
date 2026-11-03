/**
 * Creates (or resets) a demo account with realistic practice history, so every page has data:
 * reviewed conversations with corrections and saveable expressions, gaps in every status (computed
 * by the database's own recompute_language_gaps from language events, never hand-set), saved items
 * (some due, some reused in conversations), review logs, an indicator trend for the Fluency Profile,
 * and a debrief with its practice scenario. Times are relative to now; rerun to refresh.
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
const MODEL = "demo-seed";

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
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
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

type EventType = Database["public"]["Tables"]["language_events"]["Insert"]["event_type"];
type Pair = [category: string, subCategory: string];

const POLITE: Pair = ["pragmatics", "polite_requests"];
const CLOSING: Pair = ["pragmatics", "conversation_closing"];
const DISAGREE: Pair = ["pragmatics", "disagreeing_politely"];
const TOO_FORMAL: Pair = ["register", "too_formal"];
const ARTICLES: Pair = ["grammar", "articles"];

type Correction = {
  /** Index of the learner turn (0 = first user turn); `original` must be a quote from it. */
  turn: number;
  original: string;
  improved: string;
  pair: Pair;
  isGrammatical: boolean;
  explanation: string;
  save?: { expression: string; meaning: string };
};
type Event = { turn: number; type: EventType; pair: Pair; suggestion: string | null; confidence?: number };

type ConversationSpec = {
  slug: string;
  status: "completed" | "abandoned";
  startedAgo: number;
  /** The learner's turns; the partner's lines come from the scenario's opening line and `replies`. */
  user: string[];
  replies: string[];
  review?: {
    label: "needs_work" | "developing" | "good_communication" | "strong";
    summary: string;
    scores: [fluency: number, naturalness: number, grammar: number, vocabulary: number, confidence: number];
    strengths: string[];
    corrections: Correction[];
  };
  events?: Event[];
  /** Saved items (by expression) this conversation targeted and the learner used naturally (Reuse). */
  usedItems?: string[];
  /** The gap this conversation practiced (M9). */
  focus?: Pair;
};

// Oldest first. Scores rise over time so the Fluency Profile shows a trend.
const CONVERSATIONS: ConversationSpec[] = [
  {
    slug: "party-introductions",
    status: "completed",
    startedAgo: 40 * DAY,
    user: [
      "Good evening. It is a pleasure to make your acquaintance.",
      "I am currently pursuing a master's degree in data science.",
    ],
    replies: ["Ha, nice to meet you too! So what do you do?"],
    review: {
      label: "developing",
      summary: "You introduced yourself clearly, but it sounded more like a job interview than a party.",
      scores: [52, 44, 72, 60, 48],
      strengths: ["Shared what you study right away"],
      corrections: [
        {
          turn: 0,
          original: "It is a pleasure to make your acquaintance.",
          improved: "Nice to meet you!",
          pair: TOO_FORMAL,
          isGrammatical: true,
          explanation: "Correct, but very formal for a party. A short, warm greeting fits better.",
          save: { expression: "Nice to meet you!", meaning: "A friendly greeting when you meet someone." },
        },
      ],
    },
    events: [
      { turn: 0, type: "register_mismatch", pair: TOO_FORMAL, suggestion: "Nice to meet you!" },
      {
        turn: 1,
        type: "register_mismatch",
        pair: TOO_FORMAL,
        suggestion: "I'm doing a master's in data science.",
      },
    ],
  },
  {
    slug: "after-class-small-talk",
    status: "completed",
    startedAgo: 33 * DAY,
    user: ["Yeah, that lecture was kind of a lot, right?", "Honestly I'm still figuring it out too."],
    replies: ["Totally. Did you get the part about the midterm?"],
    review: {
      label: "good_communication",
      summary: "Relaxed and natural. You matched the casual tone of an after-class chat.",
      scores: [58, 60, 74, 62, 55],
      strengths: ["Casual, friendly tone", "Kept the chat going"],
      corrections: [],
    },
    events: [
      { turn: 0, type: "good_usage", pair: TOO_FORMAL, suggestion: null },
      { turn: 1, type: "good_usage", pair: TOO_FORMAL, suggestion: null },
    ],
  },
  {
    slug: "career-fair",
    status: "completed",
    startedAgo: 12 * DAY,
    user: [
      "Give me information about your internship program.",
      "No, I think this requirement is wrong for me.",
    ],
    replies: ["Sure! It's a 12-week summer program. Are you graduating next year?"],
    review: {
      label: "developing",
      summary: "You asked about the right things. Some requests sounded like commands for a first meeting.",
      scores: [60, 52, 75, 63, 57],
      strengths: ["Asked about the program directly"],
      corrections: [
        {
          turn: 0,
          original: "Give me information about your internship program.",
          improved: "Could you tell me a bit about your internship program?",
          pair: POLITE,
          isGrammatical: true,
          explanation:
            "Grammatically fine, but it sounds like an order. A question is friendlier at a booth.",
          save: {
            expression: "Could you tell me a bit about…?",
            meaning: "A polite way to ask for information.",
          },
        },
        {
          turn: 1,
          original: "I think this requirement is wrong for me.",
          improved: "I'm not sure I meet that requirement yet. Is there any flexibility?",
          pair: DISAGREE,
          isGrammatical: true,
          explanation: "Saying something is 'wrong' sounds confrontational. Ask about it instead.",
        },
      ],
    },
    events: [
      {
        turn: 0,
        type: "overly_direct",
        pair: POLITE,
        suggestion: "Could you tell me a bit about your internship program?",
      },
      {
        turn: 1,
        type: "overly_direct",
        pair: DISAGREE,
        suggestion: "I'm not sure I meet that requirement yet.",
      },
    ],
  },
  {
    slug: "coffee-shop-order",
    status: "completed",
    startedAgo: 9 * DAY,
    user: ["Give me a large latte with oat milk.", "No. That's all."],
    replies: ["You got it! Anything else for you today?"],
    review: {
      label: "developing",
      summary:
        "Quick and clear under pressure. The order and the goodbye sounded abrupt for a friendly barista.",
      scores: [64, 55, 78, 65, 62],
      strengths: ["Ordered clearly", "Kept up with the pace"],
      corrections: [
        {
          turn: 0,
          original: "Give me a large latte with oat milk.",
          improved: "Could I get a large oat milk latte, please?",
          pair: POLITE,
          isGrammatical: true,
          explanation: "'Give me' is very direct. 'Could I get…' is how most people order.",
          save: { expression: "Could I get…, please?", meaning: "The usual way to order in a café." },
        },
        {
          turn: 1,
          original: "No. That's all.",
          improved: "No, that's it, thanks!",
          pair: CLOSING,
          isGrammatical: true,
          explanation: "Adding 'thanks' turns a flat ending into a friendly one.",
          save: { expression: "That's it, thanks!", meaning: "A friendly way to finish an order." },
        },
      ],
    },
    events: [
      {
        turn: 0,
        type: "overly_direct",
        pair: POLITE,
        suggestion: "Could I get a large oat milk latte, please?",
      },
      { turn: 1, type: "missed_opportunity", pair: CLOSING, suggestion: "No, that's it, thanks!" },
    ],
  },
  {
    slug: "group-project-disagreement",
    status: "completed",
    startedAgo: 6 * DAY,
    user: ["No, this is not fair. We must split it by the workload.", "Okay. I go now. Bye."],
    replies: ["Hmm, okay. What would that look like?"],
    review: {
      label: "developing",
      summary: "You stood your ground, which is good. Softening the disagreement would make it land better.",
      scores: [66, 58, 76, 66, 64],
      strengths: ["Suggested a concrete alternative"],
      corrections: [
        {
          turn: 0,
          original: "No, this is not fair.",
          improved: "I see where you're coming from, but I'm not sure it's fair.",
          pair: DISAGREE,
          isGrammatical: true,
          explanation: "Acknowledging their view first keeps the discussion collaborative.",
          save: {
            expression: "I see where you're coming from, but…",
            meaning: "Shows you understand before you disagree.",
          },
        },
        {
          turn: 1,
          original: "I go now.",
          improved: "I should probably get going.",
          pair: ["grammar", "tenses"],
          isGrammatical: false,
          explanation: "Use 'I'm going' or the softer 'I should probably get going' for leaving now.",
          save: { expression: "I should probably get going.", meaning: "A polite way to start leaving." },
        },
      ],
    },
    events: [
      { turn: 0, type: "overly_direct", pair: DISAGREE, suggestion: "I see where you're coming from, but…" },
      { turn: 0, type: "grammar_error", pair: ARTICLES, suggestion: "split it by workload", confidence: 0.7 },
      { turn: 1, type: "missed_opportunity", pair: CLOSING, suggestion: "I should probably get going." },
    ],
  },
  {
    slug: "office-hours",
    status: "completed",
    startedAgo: 3 * DAY,
    user: [
      "I don't understand question 3. Explain it again.",
      "Could you tell me a bit about how step two works?",
    ],
    replies: ["Sure. Which part is confusing: the setup or the proof?"],
    review: {
      label: "good_communication",
      summary: "Much better requests by the end. The first one still sounded like a command.",
      scores: [70, 63, 80, 69, 68],
      strengths: ["Reused 'Could you tell me a bit about…' naturally"],
      corrections: [
        {
          turn: 0,
          original: "Explain it again.",
          improved: "Could you walk me through it one more time?",
          pair: POLITE,
          isGrammatical: true,
          explanation:
            "An imperative sounds demanding to a professor. 'Could you walk me through…' is softer.",
          save: {
            expression: "Could you walk me through…?",
            meaning: "Asks someone to explain step by step.",
          },
        },
      ],
    },
    events: [
      {
        turn: 0,
        type: "overly_direct",
        pair: POLITE,
        suggestion: "Could you walk me through it one more time?",
      },
    ],
    usedItems: ["Could you tell me a bit about…?"],
    focus: POLITE,
  },
  {
    slug: "roommate-noise",
    status: "completed",
    startedAgo: 1 * DAY,
    user: [
      "I see where you're coming from, but I have an exam tomorrow.",
      "I get that, but could we keep it down after eleven?",
    ],
    replies: ["Oh, sorry! I didn't think it was that loud."],
    review: {
      label: "good_communication",
      summary: "You disagreed politely and suggested a fair compromise. Nicely done.",
      scores: [74, 68, 82, 70, 73],
      strengths: ["Acknowledged their side first", "Offered a clear compromise"],
      corrections: [],
    },
    events: [
      { turn: 0, type: "good_usage", pair: DISAGREE, suggestion: null, confidence: 0.9 },
      { turn: 1, type: "good_usage", pair: DISAGREE, suggestion: null, confidence: 0.85 },
    ],
    usedItems: ["I see where you're coming from, but…"],
    focus: DISAGREE,
  },
  {
    slug: "airport-rebooking",
    status: "abandoned",
    startedAgo: 4 * DAY + 3 * HOUR,
    user: [],
    replies: [],
  },
];

const STUDIO_ITEMS = [
  {
    type: "phrase" as const,
    expression: "touch base",
    meaning: "To briefly check in with someone.",
    example: "Let's touch base after the lecture.",
    dueIn: 1 * DAY,
    reviews: 3,
    mastery: 0.6,
  },
  {
    type: "word" as const,
    expression: "tentative",
    meaning: "Not certain or fixed; provisional.",
    example: "Our meeting time is tentative for now.",
    dueIn: 4 * DAY,
    reviews: 4,
    mastery: 0.8,
  },
  {
    type: "phrase" as const,
    expression: "on the same page",
    meaning: "Agreeing about something in the same way.",
    example: "Just to make sure we're on the same page, we present on Friday?",
    dueIn: -2 * HOUR,
    reviews: 2,
    mastery: 0.5,
  },
];

const DEBRIEF = {
  situation:
    "I emailed my TA to ask for an extension on the problem set and got no reply. Then I saw her after class and didn't know how to bring it up.",
  whatYouSaid: "I need more time for the assignment. Please give me an extension.",
  result: {
    situationSummary:
      "You wanted to ask your TA for an extension in person after she hadn't replied to your email.",
    phrasings: [
      {
        register: "casual" as const,
        text: "Hey, sorry to bug you! Did you get a chance to see my email about the problem set?",
        note: "If you already know the TA a bit.",
      },
      {
        register: "neutral" as const,
        text: "Hi, I sent you an email about the problem set. I was wondering if I could get a couple more days.",
        note: "Works for almost any TA.",
      },
      {
        register: "formal" as const,
        text: "Excuse me, do you have a moment? I wanted to follow up on my email about a possible extension.",
        note: "For a professor or a TA you don't know.",
      },
    ],
    explanation:
      "'I need more time… Please give me an extension' is clear, but it sounds like a demand. Mentioning your email first gives context, and 'I was wondering if…' turns the demand into a request she can say yes to.",
    expressions: [
      { expression: "I was wondering if…", meaning: "A soft way to start a request." },
      { expression: "follow up on", meaning: "Check on something you asked about before." },
    ],
    scenario: {
      title: "Asking a TA for an Extension",
      description: "You emailed your TA about an extension and got no reply. You catch her after class.",
      userRole: "A student who needs two more days for a problem set",
      aiRole: "Your TA, Priya",
      aiPersonality: "Friendly but busy, packing up to leave",
      goal: "Ask for a short extension politely and agree on a new deadline.",
      difficulty: "upper_intermediate" as const,
      openingLine: "Oh hi! Did you need something? I've got a couple of minutes.",
      estMinutes: 5,
    },
    model: MODEL,
  },
};

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
      onboarded_at: ago(41 * DAY),
    })
    .eq("id", userId);
  fail("profile", profileError);

  const { data: scenarios, error: scenarioError } = await admin
    .from("scenarios")
    .select(
      "id, slug, category, title, description, user_role, ai_role, ai_personality, goal, difficulty, opening_line, est_minutes, is_custom",
    )
    .eq("is_custom", false);
  fail("scenarios", scenarioError);
  const bySlug = new Map((scenarios ?? []).map((s) => [s.slug, s]));

  // Gaps first (titles from gap_taxonomy, aggregates left to the recompute at the end).
  const { data: taxonomy, error: taxonomyError } = await admin
    .from("gap_taxonomy")
    .select("category, sub_category, title, description");
  fail("gap_taxonomy", taxonomyError);
  const gapIds = new Map<string, string>();
  const pairKey = ([category, sub]: Pair) => `${category}/${sub}`;
  const pairs = new Map(
    CONVERSATIONS.flatMap((c) => [...(c.events ?? []).map((e) => e.pair), ...(c.focus ? [c.focus] : [])]).map(
      (p) => [pairKey(p), p],
    ),
  );
  for (const [key, [category, sub]] of pairs) {
    const details = (taxonomy ?? []).find((t) => t.category === category && t.sub_category === sub);
    if (!details) throw new Error(`Unknown taxonomy pair ${key}.`);
    const { data, error } = await admin
      .from("language_gaps")
      .insert({
        user_id: userId,
        category,
        sub_category: sub,
        title: details.title,
        description: details.description,
      })
      .select("id")
      .single();
    fail(`gap ${key}`, error);
    gapIds.set(key, data!.id);
  }

  const itemIds = new Map<string, string>();

  for (const spec of CONVERSATIONS) {
    const scenario = bySlug.get(spec.slug);
    if (!scenario) throw new Error(`Scenario "${spec.slug}" not found. Apply supabase/seed.sql first.`);
    const startedAt = now - spec.startedAgo;
    const endedAt = new Date(startedAt + 12 * MINUTE).toISOString();
    const conversationId = randomUUID();

    const { error: conversationError } = await admin.from("conversations").insert({
      id: conversationId,
      user_id: userId,
      scenario_id: scenario.id,
      // The same shape as toScenarioSnapshot (src/lib/domain/conversation.ts).
      scenario_snapshot: {
        scenarioId: scenario.id,
        slug: scenario.slug,
        isCustom: false,
        category: scenario.category,
        title: scenario.title,
        description: scenario.description ?? "",
        userRole: scenario.user_role,
        aiRole: scenario.ai_role,
        aiPersonality: scenario.ai_personality ?? "",
        goal: scenario.goal,
        difficulty: scenario.difficulty,
        openingLine: scenario.opening_line,
        estMinutes: scenario.est_minutes,
      },
      status: spec.status,
      started_at: new Date(startedAt).toISOString(),
      ended_at: endedAt,
      completed_at: spec.status === "completed" ? endedAt : null,
      overall_score: spec.review
        ? Math.round(spec.review.scores.reduce((sum, s) => sum + s, 0) / spec.review.scores.length)
        : null,
    });
    fail(`conversation ${spec.slug}`, conversationError);

    // Opening line, then learner / partner turns alternating.
    const lines: { role: "assistant" | "user"; content: string }[] = [
      { role: "assistant", content: scenario.opening_line ?? "Hi! What can I do for you?" },
    ];
    spec.user.forEach((text, i) => {
      lines.push({ role: "user", content: text });
      if (spec.replies[i]) lines.push({ role: "assistant", content: spec.replies[i]! });
    });
    const messages = lines.map((line, seq) => ({
      id: randomUUID(),
      conversation_id: conversationId,
      user_id: userId,
      role: line.role,
      content: line.content,
      seq,
      created_at: new Date(startedAt + seq * MINUTE).toISOString(),
    }));
    const { error: messageError } = await admin.from("messages").insert(messages);
    fail(`messages ${spec.slug}`, messageError);
    const userTurns = messages.filter((m) => m.role === "user");
    const turn = (i: number) => {
      const message = userTurns[i];
      if (!message) throw new Error(`${spec.slug}: no learner turn ${i}.`);
      return message;
    };

    if (spec.review) {
      const [fluency, naturalness, grammar, vocabulary, confidence] = spec.review.scores;
      const { error: feedbackError } = await admin.from("conversation_feedback").insert({
        conversation_id: conversationId,
        user_id: userId,
        summary: spec.review.summary,
        overall_label: spec.review.label,
        fluency_score: fluency,
        naturalness_score: naturalness,
        grammar_score: grammar,
        vocabulary_score: vocabulary,
        confidence_score: confidence,
        strengths: spec.review.strengths,
        model: MODEL,
        created_at: new Date(Date.parse(endedAt) + MINUTE).toISOString(),
      });
      fail(`feedback ${spec.slug}`, feedbackError);

      for (const [position, c] of spec.review.corrections.entries()) {
        const message = turn(c.turn);
        if (!message.content.includes(c.original)) {
          throw new Error(`${spec.slug}: "${c.original}" is not a quote from the learner's turn.`);
        }
        const { data: correction, error } = await admin
          .from("corrections")
          .insert({
            conversation_id: conversationId,
            user_id: userId,
            message_id: message.id,
            position,
            original: c.original,
            improved: c.improved,
            category: c.pair[0],
            sub_category: c.pair[1],
            is_grammatical: c.isGrammatical,
            explanation: c.explanation,
            saveable_expressions: c.save ? [c.save] : [],
          })
          .select("id")
          .single();
        fail(`correction ${spec.slug}`, error);
        if (c.save) {
          // Saved from the review, as "Add to My English" would.
          const index = itemIds.size;
          const { data: item, error: itemError } = await admin
            .from("learning_items")
            .insert({
              user_id: userId,
              type: "expression",
              expression: c.save.expression,
              meaning: c.save.meaning,
              example: c.improved,
              details: { review: { original: c.original, improved: c.improved, explanation: c.explanation } },
              source: "review",
              source_conversation_id: conversationId,
              source_correction_id: correction!.id,
              mastery_score: Math.min(0.2 + index * 0.1, 0.7),
              review_count: index % 3,
              interval_days: index % 3,
              next_review_at: index % 2 === 0 ? ago(3 * HOUR) : ahead((index + 1) * DAY),
              last_reviewed_at: index % 3 > 0 ? ago(2 * DAY) : null,
              created_at: new Date(Date.parse(endedAt) + 2 * MINUTE).toISOString(),
            })
            .select("id")
            .single();
          fail(`item ${c.save.expression}`, itemError);
          itemIds.set(c.save.expression, item!.id);
        }
      }
    }

    for (const e of spec.events ?? []) {
      const message = turn(e.turn);
      const { error } = await admin.from("language_events").insert({
        user_id: userId,
        conversation_id: conversationId,
        message_id: message.id,
        event_type: e.type,
        category: e.pair[0],
        sub_category: e.pair[1],
        original: message.content,
        suggestion: e.suggestion,
        context: scenario.title,
        confidence: e.confidence ?? 0.8,
        gap_id: gapIds.get(pairKey(e.pair))!,
        created_at: message.created_at,
      });
      fail(`event ${spec.slug}`, error);
    }

    // Reuse: targets this conversation practiced, and saved items used naturally (one review each).
    const targets = [
      ...(spec.focus
        ? [{ gap_id: gapIds.get(pairKey(spec.focus))!, item_id: null, used_naturally: null }]
        : []),
      ...(spec.usedItems ?? []).map((expression) => {
        const id = itemIds.get(expression);
        if (!id) throw new Error(`${spec.slug}: item "${expression}" isn't saved by then.`);
        return { gap_id: null, item_id: id, used_naturally: true };
      }),
    ];
    if (targets.length > 0) {
      const { error } = await admin
        .from("conversation_targets")
        .insert(targets.map((t) => ({ ...t, conversation_id: conversationId, user_id: userId })));
      fail(`targets ${spec.slug}`, error);
      const used = targets.flatMap((t) => (t.item_id ? [t.item_id] : []));
      if (used.length > 0) {
        const { error: logError } = await admin.from("review_logs").insert(
          used.map((itemId) => ({
            user_id: userId,
            item_id: itemId,
            conversation_id: conversationId,
            rating: "good" as const,
            mode: "conversation" as const,
            created_at: endedAt,
          })),
        );
        fail(`reuse logs ${spec.slug}`, logError);
      }
    }
  }

  // Gap statuses and aggregates from the events, by the same SQL as a real review.
  const { error: recomputeError } = await admin.rpc("recompute_language_gaps", { p_user_id: userId });
  fail("recompute_language_gaps", recomputeError);

  const { data: studioItems, error: studioError } = await admin
    .from("learning_items")
    .insert(
      STUDIO_ITEMS.map((item) => ({
        user_id: userId,
        type: item.type,
        expression: item.expression,
        meaning: item.meaning,
        example: item.example,
        source: "studio" as const,
        mastery_score: item.mastery,
        review_count: item.reviews,
        interval_days: item.reviews,
        next_review_at: item.dueIn < 0 ? ago(-item.dueIn) : ahead(item.dueIn),
        last_reviewed_at: ago(2 * DAY),
        created_at: ago(20 * DAY),
      })),
    )
    .select("id");
  fail("studio items", studioError);

  // A review session two days ago (keeps the streak going between conversations).
  const { error: reviewError } = await admin.from("review_logs").insert(
    (studioItems ?? []).map((item, i) => ({
      user_id: userId,
      item_id: item.id,
      rating: i === 0 ? ("hard" as const) : ("good" as const),
      mode: "recall" as const,
      created_at: ago(2 * DAY + i * MINUTE),
    })),
  );
  fail("review_logs", reviewError);

  // A debrief with its result, the practice scenario made from it, and one saved expression.
  const { scenario } = DEBRIEF.result;
  const { data: practice, error: practiceError } = await admin
    .from("scenarios")
    .insert({
      category: "custom",
      is_custom: true,
      created_by: userId,
      title: scenario.title,
      description: scenario.description,
      user_role: scenario.userRole,
      ai_role: scenario.aiRole,
      ai_personality: scenario.aiPersonality,
      goal: scenario.goal,
      difficulty: scenario.difficulty,
      opening_line: scenario.openingLine,
      est_minutes: scenario.estMinutes,
    })
    .select("id")
    .single();
  fail("debrief scenario", practiceError);
  const { data: debrief, error: debriefError } = await admin
    .from("debriefs")
    .insert({
      user_id: userId,
      situation: DEBRIEF.situation,
      what_user_said: DEBRIEF.whatYouSaid,
      result: DEBRIEF.result,
      scenario_id: practice!.id,
      created_at: ago(5 * DAY),
    })
    .select("id")
    .single();
  fail("debrief", debriefError);
  const saved = DEBRIEF.result.expressions[0]!;
  const { error: debriefItemError } = await admin.from("learning_items").insert({
    user_id: userId,
    type: "expression",
    expression: saved.expression,
    meaning: saved.meaning,
    example: DEBRIEF.result.phrasings[1]!.text,
    details: { debrief: { situationSummary: DEBRIEF.result.situationSummary } },
    source: "debrief",
    source_debrief_id: debrief!.id,
    next_review_at: ago(1 * HOUR),
    created_at: ago(5 * DAY),
  });
  fail("debrief item", debriefItemError);
}

async function summary(userId: string) {
  const { data } = await admin
    .from("language_gaps")
    .select("title, status, severity, evidence_count")
    .eq("user_id", userId)
    .order("title");
  console.log("Gaps (computed by recompute_language_gaps):");
  for (const g of data ?? []) {
    console.log(
      `  ${g.title.padEnd(24)} ${g.status.padEnd(10)} ${g.severity.padEnd(7)} evidence ${g.evidence_count}`,
    );
  }
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
    await summary(data.user!.id);
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
