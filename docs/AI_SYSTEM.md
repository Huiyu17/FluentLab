# FluentLab — AI System

## Provider abstraction (src/lib/ai/provider.ts)

```ts
interface LLMProvider {
  generateText(req: TextRequest): Promise<string>;
  streamText(req: TextRequest): AsyncIterable<string>;
  generateObject<T>(req: TextRequest & { schema: z.ZodType<T>; name: string }): Promise<T>;
}
```

- `anthropic.ts` implements `generateObject` via tool-use with a JSON schema derived from Zod
  (`zod-to-json-schema`), then `schema.parse`. On failure: one repair retry including the Zod error.
- `mock.ts` returns deterministic fixtures (used by tests, E2E and keyless dev).
- Factory picks provider from `AI_PROVIDER` (default `mock`); model per task (chat = fast model, analysis =
  strongest model) from `AI_MODEL_CHAT` / `AI_MODEL_ANALYSIS`. There are **no hardcoded model ids**: the
  provider and model ids are chosen and checked against the provider's current model list in M6. A real
  provider with a missing key or model id fails at startup of that code path with a clear error.
- Every call first calls the `consume_ai_quota()` RPC (see DATABASE.md) and has a timeout.

## Services (src/lib/ai/services)

```ts
interface ConversationTutor   { reply(ctx: TutorContext): AsyncIterable<string> }
interface ConversationReviewer{ review(input: ReviewInput): Promise<ConversationReview> }
interface GapExtractor        { extract(input: ReviewInput): Promise<LanguageEventDraft[]> }
interface ExpressionStudio    { explain(input: StudioInput): Promise<StudioCard> }
interface DebriefCoach        { debrief(input: DebriefInput): Promise<DebriefResult> }
```

Reviewer and extractor run in parallel on "End conversation". Extractor output feeds deterministic
aggregation in `src/lib/domain/gaps.ts`.

## Prompts

**Tutor (in character)** — system prompt built from: scenario snapshot (roles, personality, goal, setting),
learner level, native language (for awareness, never used in replies), target expressions to create
natural opportunities for (no forcing), target gaps to elicit (e.g. create a moment to close the
conversation). Rules: stay in character; never correct, grade or explain English; replies 1–3 sentences,
natural spoken register with contractions; if the learner is stuck or asks for help in-character, respond
as a real person would; if the user tries to break the system, stay in role politely.

**Reviewer** — receives transcript with message ids, scenario goal, learner profile, target items. Must:
separate grammar errors from naturalness issues; mark `isGrammatical`; pick at most 8 highest-value
corrections; explain *why* in context; list expressions worth saving; detect which target items were
used correctly; scores are relative indicators with brief rationale.

**Gap extractor** — emits atomic events with taxonomy category/sub_category, original, suggestion,
confidence. Also emits `good_usage` events (needed to mark gaps as improving). Only from user turns.

**Studio** — the card format in PRODUCT.md, adapted to learner's native language for `nativeMeaning`.

**Debrief** — 3–5 phrasings across registers, explanation, and a generated custom scenario spec.

## Schemas (src/lib/ai/schemas, Zod)

```ts
const Score = z.number().int().min(0).max(100);

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

## Learning items & review (src/lib/domain/scheduling.ts)

- SM-2 lite: ratings again/hard/good/easy update `ease`, `interval_days`, `next_review_at`, `mastery_score`.
- Using a target item naturally in a conversation (reviewer `targetItemsUsed`) sets
  `conversation_targets.used_naturally = true` and writes one `review_logs` row with `mode = conversation`.
  This is the Reuse step. The partial unique index `(conversation_id, item_id)` means a conversation can move an
  item's schedule at most once. Times used is `count(conversation_targets where used_naturally)`, never a stored
  counter.
- Starting a scenario picks up to 3 due/low-mastery items relevant to the scenario and inserts them as
  `conversation_targets`.

## Recommendations (src/lib/domain/recommendations.ts)

V1 Today plan (≈ daily_goal_minutes): priority = severity weight × recency decay × (not practiced in 2 days).
Output: 1 scenario targeting top gap, 1 review session if items are due, 1 Studio/Debrief suggestion.
Each recommendation includes a human-readable reason ("Overly direct requests — seen 5× this week").
