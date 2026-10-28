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
- Factory picks provider from `AI_PROVIDER`; model per task (chat = fast model, analysis = strongest model).
- Every call goes through `withUsage(userId)` (quota check + increment) and a timeout.

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
    category: z.enum(["naturalness", "grammar", "vocabulary", "pragmatics", "register"]),
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

## Gap detection (deterministic, src/lib/domain/gaps.ts)

1. Discard events with `confidence < 0.6`.
2. Upsert gap by `(user_id, category, sub_category)`; link events; increment `evidence_count`,
   `conversations_count` (distinct), update `last_detected_at`.
3. A gap becomes visible (`active`) once `evidence_count ≥ 2` or one event with confidence ≥ 0.85.
4. Severity from evidence in the last 14 days: 2–3 → low, 4–6 → medium, ≥ 7 or recurring in ≥ 3
   conversations → high.
5. `good_usage` events or 3 practice conversations targeting the gap without new negative evidence
   → `improving`; 30 days without negative evidence after improving → `resolved`. Users can dismiss.

## Learning items & review (src/lib/domain/scheduling.ts)

- SM-2 lite: ratings again/hard/good/easy update `ease`, `interval_days`, `next_review_at`, `mastery_score`.
- Using an item naturally in a conversation (reviewer `targetItemsUsed`) counts as a strong "good"
  review and increments `times_used_in_conversation` — this is the Reuse step.
- Starting a scenario picks up to 3 due/low-mastery items relevant to the scenario as targets.

## Recommendations (src/lib/domain/recommendations.ts)

V1 Today plan (≈ daily_goal_minutes): priority = severity weight × recency decay × (not practiced in 2 days).
Output: 1 scenario targeting top gap, 1 review session if items are due, 1 Studio/Debrief suggestion.
Each recommendation includes a human-readable reason ("Overly direct requests — seen 5× this week").
