# FluentLab — AI System

## Provider abstraction (src/lib/ai/provider.ts)

```ts
interface LLMProvider {
  generateText(req: TextRequest): Promise<string>;
  streamText(req: TextRequest): AsyncIterable<string>;
  generateJson(req: TextRequest & { name: string; jsonSchema: object }): Promise<unknown>; // raw JSON
}
// src/lib/ai/structured.ts — the only way to get structured output:
generateObject<T>(provider, req & { name; schema: z.ZodType<T> }): Promise<T>
```

- **Provider (M6): Gemini** via `@google/genai` (`providers/gemini.ts`), chosen to develop on the free tier.
  `generateContent` / `generateContentStream`; structured output with `responseMimeType: "application/json"` +
  `responseJsonSchema` (Gemini ignores `minLength`/`maxLength`, so Zod stays the real check). Chat uses thinking
  level LOW, analysis MEDIUM; thinking tokens count toward `maxOutputTokens`, so an empty answer
  (`finishReason: MAX_TOKENS`) is an `invalid_output` error, never an empty reply. Default timeouts 30 s
  (request) / 60 s (stream); one retry for 5xx only. **429 is never retried and never falls back to another
  provider or a paid tier**: it becomes `AIError("provider_quota")` with a clear message. Safety blocks become
  `AIError("blocked")`. Verified 2026-10-29 with `npm run test:ai` (text, stream, Studio card) on
  `gemini-3.6-flash`; free tier on this project: 5 requests/minute **and 20 requests/day** per model (from the 429
details: `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, found 2026-10-29). Every chat turn, Studio card and
review is one request, so a day allows roughly one or two practice conversations.
  `gemini-3.8-flash` was overloaded (503 / no response) at the time. Free-tier content may be used by Google
  to improve its products: don't enter real personal information while testing.
- Providers only return raw JSON. `generateObject` builds the
  JSON Schema with Zod 4's `z.toJSONSchema`, validates with `schema.safeParse`, and on failure makes one repair
  retry that includes the Zod error; a second failure throws `AIError("invalid_output")`. Validation lives in one
  place, so every provider gets the same guarantee. Logs record only the failing field paths, never content.
- `mock.ts` returns deterministic fixtures (used by tests, E2E and keyless dev).
- Factory picks provider from `AI_PROVIDER` (default `mock`); model per task (chat = fast model, analysis =
  strongest model) from `AI_MODEL_CHAT` / `AI_MODEL_ANALYSIS`. There are **no hardcoded model ids**: the
  provider and model ids are chosen and checked against the provider's current model list in M6. A real
  provider with a missing key or model id fails at startup of that code path with a clear error.
- Every call first calls the `consume_ai_quota()` RPC (see DATABASE.md) and has a timeout (30 s default).
  Quota is spent only once a provider is available, so a misconfigured provider doesn't use up the day.
- Mock output for unknown inputs is clearly labelled as a sample, and services return `sample: true` so the UI
  can say AI isn't connected (M4 Studio uses this until M6).

## Services (src/lib/ai/services)

```ts
interface ConversationTutor   { reply(ctx: TutorContext): AsyncIterable<string> }
interface ConversationReviewer{ review(input: ReviewInput): Promise<ConversationReview> }
interface GapExtractor        { extract(input: ReviewInput): Promise<LanguageEventDraft[]> }
interface ExpressionStudio    { explain(input: StudioInput): Promise<StudioCard> }
interface DebriefCoach        { debrief(input: DebriefInput): Promise<DebriefResult> }
```

Decision (M8, 2026-10-29): the reviewer and the gap extractor are **one model call** that returns corrections and
language events together (half the quota on a 5-requests/minute free tier, and corrections and events can't
contradict each other). The two parts are still validated and resolved separately. Events feed deterministic
aggregation in `src/lib/domain/gaps.ts`. Conversations reviewed before M8 are not re-analysed.

## Prompts

**Tutor (in character)** — system prompt built from: scenario snapshot (roles, personality, goal, setting),
learner level, native language (for awareness, never used in replies), target expressions to create
natural opportunities for (no forcing), target gaps to elicit (e.g. create a moment to close the
conversation). Rules: stay in character; never correct, grade or explain English; replies 1–3 sentences,
natural spoken register with contractions; if the learner is stuck or asks for help in-character, respond
as a real person would; if the user tries to break the system, stay in role politely.
Implemented in M6 (`prompts/tutor.ts`, `tutor-v1`): the system prompt holds only these trusted rules; the
scenario snapshot, learner profile and target expressions are escaped, tagged data in the **first user turn**
(custom scenarios are learner-written), followed by the real conversation starting with the opening line. On the
last allowed turn (30) the tutor is asked to close naturally. A scenario without an opening line gets one from the
tutor when the conversation starts. Target gaps join the briefing in M8.

**Reviewer** — receives transcript with message ids, scenario goal, learner profile, target items. Must:
separate grammar errors from naturalness issues; mark `isGrammatical`; pick at most 8 highest-value
corrections; explain *why* in context; list expressions worth saving; detect which target items were
used correctly; scores are relative indicators with brief rationale.
Implemented in M7 (`prompts/reviewer.ts`, `reviewer-v1`; `services/reviewer.ts`): one `analysis` call per
conversation (8192 output tokens, 90 s for both attempts). Learner turns are `<learner id="m1">`, partner turns
`<partner>` (context only, no ids, so a correction can't target them), targets `<target id="t1">`. The model
answers with these short refs, never database ids (`ReviewOutputSchema`); `resolveReview` maps them back and
**drops** a correction whose ref is unknown, whose `original` isn't actually in that learner turn (compared
lowercase, letters/digits only; the learner never sees words they didn't write) or whose `improved` changes
nothing, and unknown/duplicate target refs. Corrections are sorted into transcript order. The prompt says
"not selected" is not "correct": the review page never marks uncorrected turns as correct. Verified live
2026-10-29 on `gemini-3.6-flash` (`npm run test:ai -- -t "live reviewer"`): grammar (`articles`,
`isGrammatical=false`) and a too-direct request (`pragmatics/polite_requests`, `isGrammatical=true`) kept apart,
target use detected, nothing dropped, ~11 s.
`reviewer-v2` (M8) adds `events` to the same call (`ReviewEventOutputSchema`, ≤ 40): every clear instance in the
learner's turns, including `good_usage`, with an honest confidence (< 0.6 when debatable). `resolveReview` drops
events with unknown refs or invented quotes, keeps one per (message, type, category, sub-category) with the highest
confidence (the table's natural key would otherwise keep whichever came first), forces `suggestion = null` for
`good_usage` and rounds confidence to 2 decimals so SQL (`real`) and TypeScript apply the same thresholds.

**Gap extractor** — emits atomic events with taxonomy category/sub_category, original, suggestion,
confidence. Also emits `good_usage` events (needed to mark gaps as improving). Only from user turns.

**Studio** — the card format in PRODUCT.md, adapted to learner's native language for `nativeMeaning`.

**Debrief** — 3–5 phrasings across registers, explanation, and a generated custom scenario spec.

## Schemas (src/lib/ai/schemas, Zod)

```ts
const Score = z.number().int().min(0).max(100);

// Shape stored by apply_conversation_review (ConversationReview in schemas/review.ts). The model itself
// returns ReviewOutputSchema: the same fields with messageRef / targetRef instead of ids.
ConversationReview = z.object({
  summary: z.string().max(600),
  overallLabel: z.enum(["needs_work", "developing", "good_communication", "strong"]),
  scores: z.object({ fluency: Score, naturalness: Score, grammar: Score, vocabulary: Score, confidence: Score }),
  strengths: z.array(z.string()).max(4),
  corrections: z.array(z.object({
    messageId: z.string().uuid(),
    original: z.string(), improved: z.string(),
    category: CategoryEnum,                    // same taxonomy as gaps (taxonomy.ts)
    subCategory: SubCategoryEnum.nullable(),   // must belong to category (superRefine)
    isGrammatical: z.boolean(),
    explanation: z.string().max(800),
    saveableExpressions: z.array(z.object({ expression: z.string(), meaning: z.string() })).max(3),
  })).max(8),
  targetItemsUsed: z.array(z.object({ itemId: z.string().uuid(), usedNaturally: z.boolean() })),
});

LanguageEventDraft = z.object({
  messageId: z.string().uuid(),
  eventType: EventTypeEnum, category: CategoryEnum, subCategory: SubCategoryEnum,
  original: z.string(), suggestion: z.string().nullable(), context: z.string(),
  confidence: z.number().min(0).max(1),
});

StudioCard = z.object({
  expression, type, ipa?, coreMeaning, nativeMeaning, nativeIntuition,
  patterns: string[], examples: string[], commonMistake?: { wrong, right[] },
  similar: { expression, nuance }[], register: enum, frequency: 1–5, tryIt: string,
});
```

Message ids returned by the model are checked against the actual transcript; unknown ids are dropped.

`CategoryEnum`, `SubCategoryEnum` and the valid pairs all come from `src/lib/domain/taxonomy.ts`. Every schema
with a category/subCategory pair uses `superRefine` to reject pairs that don't belong together, and the database
enforces the same pairs with a composite FK to `gap_taxonomy`. "Naturalness" is only a score dimension:
`pragmatics`, `natural_expression` and `register` roll up to it, `grammar` → grammar, `vocabulary` → vocabulary
(`SCORE_DIMENSION_BY_CATEGORY` in taxonomy.ts).

## Gap detection (deterministic, src/lib/domain/gaps.ts)

Gaps are a recomputable cache of `language_events`. Recompute a gap from all of its events, never increment,
so re-applying a review gives the same result.

1. Persist every valid event (any confidence). Only events with `confidence ≥ 0.6` count as evidence;
   `good_usage` events are positive evidence, all other types are negative.
2. Find or create the gap for `(user_id, category, sub_category)` and link the event (`gap_id`).
3. Recompute from linked events: `evidence_count` (negative, ≥ 0.6), `conversations_count` (distinct
   conversations among them), `first/last_detected_at`, `confidence` = max confidence.
4. **Status**
   - `emerging`: stored but **not shown** in Gap Tracker or used for recommendations. This is the state of
     every new gap until it reaches the threshold.
   - `emerging → active` when `evidence_count ≥ 2`, or a single negative event has `confidence ≥ 0.85`.
   - `active → improving` when, since the last negative event, there are ≥ 2 `good_usage` events or 3 completed
     conversations that targeted the gap.
   - `improving → active` on any new negative evidence.
   - `improving → resolved` after 30 days without negative evidence.
   - `resolved → active` on new negative evidence (the gap reopens; history is kept).
   - `dismissed` is user-set and sticky: new events still attach but never change status.
5. **Severity** (computed for every non-dismissed gap from negative evidence in the last 14 days):
   - `high`: ≥ 7 events, or present in ≥ 3 distinct conversations
   - `medium`: 4–6 events
   - `low`: 1–3 events. This includes a gap activated by **one** high-confidence event: it starts as `low`
     and goes up only as more evidence arrives.
   - No evidence in the window: severity stays at its last value; the recency term in recommendations
     lowers its priority.

Rules are pure functions over an event list, so they are unit-tested without a database.

Implemented in M8 (`src/lib/domain/gaps.ts`, mirrored in SQL by `apply_conversation_review`). Because evidence
only accumulates, the status needs no stored previous status: a gap is activated if its history ever met the
activation rule, then it is `active` until the improving condition holds **since its last negative event**
(good usages / targeted conversations strictly after it), and `resolved` once that holds and the last negative
event is ≥ 30 days old. New negative evidence therefore reopens improving/resolved gaps by construction. Only
`dismissed` and the previous severity (kept when the 14-day window is empty) carry over. Aggregates count
negative evidence only; `confidence` is the highest among it. Gap titles and descriptions are fixed per
sub-category (`GAP_DETAILS` in taxonomy.ts), never AI-written.

## Learning items & review (src/lib/domain/scheduling.ts)

- SM-2 lite: ratings again/hard/good/easy update `ease`, `interval_days`, `next_review_at`, `mastery_score`.
- Using a target item naturally in a conversation (reviewer `targetItemsUsed`) sets
  `conversation_targets.used_naturally = true` and writes one `review_logs` row with `mode = conversation`.
  This is the Reuse step. The partial unique index `(conversation_id, item_id)` means a conversation can move an
  item's schedule at most once. Times used is `count(conversation_targets where used_naturally)`, never a stored
  counter.
- Starting a scenario picks up to 3 items and inserts them as `conversation_targets`
  (`src/lib/domain/targets.ts`): due items first (longest overdue first), then the least mastered, skipping
  well-known items (mastery ≥ 0.8) unless due. Saved items have no scenario tags yet, so "relevant to the
  scenario" is approximated by "most in need of practice"; the scenario brief shows the same picks (M5).

## Recommendations (src/lib/domain/recommendations.ts)

V1 Today plan (≈ daily_goal_minutes): priority = severity weight × recency decay × (not practiced in 2 days).
Output: 1 scenario targeting top gap, 1 review session if items are due, 1 Studio/Debrief suggestion.
Each recommendation includes a human-readable reason ("Overly direct requests — seen 5× this week").
