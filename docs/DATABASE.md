# FluentLab — Database

Supabase Postgres (15+). Migrations live in `supabase/migrations/`; shared demo content in `supabase/seed.sql`.
All ids `uuid default gen_random_uuid()`, timestamps `timestamptz default now()`.

## Learner model chain

```
profiles ─┬─ conversations ─┬─ messages
          │                 ├─ conversation_targets ──> learning_items / language_gaps   (Reuse)
          │                 ├─ conversation_feedback (1:1)
          │                 ├─ corrections ──(saved as)──> learning_items
          │                 └─ language_events ──(aggregate into)──> language_gaps        (Detect)
          ├─ learning_items ── review_logs
          ├─ language_gaps
          ├─ debriefs ──> scenarios (own custom)
          └─ ai_usage
shared: scenarios (non-custom), curated_expressions, gap_categories, gap_taxonomy, app_config
```

## Design rules

1. **Same-owner foreign keys.** Every parent that a user-owned row can point to exposes `unique (id, user_id)`
   and children reference it with a composite FK `(parent_id, user_id)`. Combined with RLS
   `user_id = auth.uid()`, a row can never be linked to another user's conversation, message, item, gap or
   scenario, on INSERT or UPDATE, regardless of which client wrote it. Messages are additionally pinned to their
   conversation via `(message_id, conversation_id) → messages (id, conversation_id)`.
2. **Ledgers are the source of truth; aggregates are recomputed, never incremented.** `language_events` drive gap
   counts; `conversation_targets.used_naturally` drives item usage counts. Re-applying the same data cannot
   double-count.
3. **Derived tables are read-only to clients.** `conversation_feedback`, `corrections`, `language_events`,
   `review_logs`, `ai_usage` and gap aggregates are written only by `security definer` RPCs that check
   `auth.uid()` (RPCs land in the milestone that needs them). The only client write on `language_gaps` is
   dismissing a gap.
4. **No polymorphic ids or uuid arrays** for relationships; explicit nullable FKs or join tables instead, so
   ownership is enforceable by constraints.

## Taxonomy (single vocabulary for corrections, events and gaps)

`gap_categories` and `gap_taxonomy` are reference tables seeded in the initial migration. App code uses
`src/lib/domain/taxonomy.ts`; a unit test asserts the TS constants and the migration rows are identical.

| category | score dimension | sub_categories |
|---|---|---|
| `pragmatics` | naturalness | polite_requests, conversation_closing, conversation_opening, disagreeing_politely, small_talk, turn_taking |
| `natural_expression` | naturalness | phrasal_verbs, collocations, idioms, filler_and_softeners, word_choice |
| `register` | naturalness | too_formal, too_casual |
| `grammar` | grammar | articles, tenses, prepositions, word_order, agreement |
| `vocabulary` | vocabulary | academic, everyday, range_repetition |

- Corrections use the **same category values** as gaps. The earlier correction label "naturalness" is now
  `natural_expression`; "Naturalness" is a *score dimension* (display/grouping), not a category.
- Valid `(category, sub_category)` pairs are enforced by a composite FK to `gap_taxonomy` on `language_events`,
  `language_gaps` and `corrections` (on corrections `sub_category` is optional; a NULL skips the pair check but
  `category` is still checked against `gap_categories`).

## Tables

**app_config** (singleton, no client access) — `id boolean pk check (id)`, `ai_daily_limit int`.

**profiles** (PK = `auth.users.id`, created by trigger `on_auth_user_created`)
`id, display_name, native_language, english_level (intermediate|upper_intermediate|advanced),
learning_goal, contexts text[] (campus|social|everyday|career|travel), daily_goal_minutes, timezone, onboarded_at,
created_at, updated_at`

**scenarios** — shared catalog plus user-owned custom scenarios
`id, slug, category, title, description, user_role, ai_role, ai_personality, goal, difficulty, opening_line,
system_prompt, est_minutes, is_custom, created_by, created_at, updated_at`
- Shared: `is_custom = false`, `created_by is null`, `slug` required. Written only by migrations/seed.
- Custom: `is_custom = true`, `created_by` required, `system_prompt` must be NULL (user text is never placed in a
  system prompt; prompts are built from the structured fields, wrapped as data). Text fields length-limited.
- `unique (id, created_by)` so debriefs can reference *their own* custom scenario.

**conversations**
`id, user_id, scenario_id (→ scenarios, on delete set null), scenario_snapshot jsonb, status
(active|reviewing|completed|failed_review|abandoned), review_started_at, review_attempts, review_error, started_at,
ended_at, completed_at, overall_score`. Turn count is `count(messages)`; no stored counter.

**conversation_targets** (Reuse: what this conversation should give the learner a chance to practice)
`id, conversation_id, user_id, item_id | gap_id (exactly one), used_naturally bool null (set by review)`
Unique per `(conversation_id, item_id)` / `(conversation_id, gap_id)`.

**messages** — immutable
`id, conversation_id, user_id, role (user|assistant), content (≤ 4000), seq, created_at`; unique `(conversation_id, seq)`.

**conversation_feedback** (1:1) — `id, conversation_id unique, user_id, summary, overall_label, fluency_score,
naturalness_score, grammar_score, vocabulary_score, confidence_score, strengths text[], model, created_at`

**corrections** — `id, conversation_id, user_id, message_id, original, improved, category, sub_category,
is_grammatical, explanation, saveable_expressions jsonb, position, created_at`; unique `(conversation_id, position)`.

**learning_items**
`id, user_id, type (word|phrase|expression|grammar), expression (≤ 200), meaning, native_meaning, example,
details jsonb, source (studio|review|debrief|curated|manual), source_conversation_id, source_correction_id,
source_debrief_id, source_curated_id, mastery_score 0–1, ease, interval_days, review_count, next_review_at,
last_reviewed_at, created_at, updated_at`; unique `(user_id, lower(expression))`.
Times-used-in-conversation is derived from `conversation_targets`.

**review_logs** — `id, user_id, item_id, conversation_id null, rating (again|hard|good|easy),
mode (recall|use_in_sentence|conversation), created_at`; partial unique `(conversation_id, item_id)` where
`conversation_id is not null` → a conversation can move an item's schedule at most once.

**language_events** (atomic evidence)
`id, user_id, conversation_id, message_id, event_type (unnatural_expression|grammar_error|overly_direct|
register_mismatch|limited_vocabulary|missed_opportunity|good_usage), category, sub_category, original, suggestion,
context, confidence 0–1, gap_id null, created_at`;
unique `(conversation_id, message_id, event_type, category, sub_category)`.

**language_gaps** (aggregated learner model; aggregates are a cache of `language_events`)
`id, user_id, category, sub_category, title, description, status (emerging|active|improving|resolved|dismissed),
severity (low|medium|high), confidence, evidence_count, conversations_count, first_detected_at, last_detected_at,
last_practiced_at, status_changed_at, created_at, updated_at`; unique `(user_id, category, sub_category)`.
Status/severity rules: docs/AI_SYSTEM.md → Gap detection.

**debriefs** — `id, user_id, situation (≤ 2000), what_user_said, result jsonb, scenario_id
(→ scenarios(id, created_by), own custom only), created_at`

**curated_expressions** (shared) — `id, expression, meaning, used_when, example, register, frequency 1–5, details jsonb`

**ai_usage** — `user_id, day (UTC date), calls`; PK `(user_id, day)`.

## RLS and privileges

All tables have RLS enabled. `anon` has no privileges on any app table (the app requires login).

| Table | authenticated: select | insert | update | delete |
|---|---|---|---|---|
| profiles | own | trigger only | own | — (cascades from auth.users) |
| scenarios | shared + own custom | own custom | own custom | own custom |
| conversations | own | own, scenario must be visible | own, scenario must be visible | own |
| conversation_targets | own | own | — (RPC) | own |
| messages | own | own, conversation `active` | — | — |
| conversation_feedback, corrections, language_events, review_logs | own | — (RPC) | — | — |
| learning_items | own | own | own | own |
| language_gaps | own | — (RPC) | column `status` only, to `dismissed` | — |
| debriefs | own | own | own | own |
| curated_expressions, gap_categories, gap_taxonomy | all | — | — | — |
| ai_usage | own | — | — | — |
| app_config | — | — | — | — |

"own" = `user_id = auth.uid()` in both `using` and `with check`, so ownership cannot be changed by UPDATE.

### AI quota RPC: `consume_ai_quota() returns table (allowed boolean, calls int, daily_limit int)`

- `security definer`, `set search_path = ''`; `execute` revoked from `public`/`anon`, granted to `authenticated`.
- Identity comes only from `auth.uid()` (raises if NULL). Takes no arguments, so a caller cannot pass a
  different user or a larger limit; the limit is read from `app_config`.
- Atomic single statement:
  `insert … values (uid, utc_today, 1) on conflict (user_id, day) do update set calls = calls + 1
  where ai_usage.calls < limit returning calls`. No row returned ⇒ limit reached. Concurrent calls serialize on
  the row, so the count can never exceed the limit.
- Calling it directly from the browser can only spend the caller's own quota.

### Item review RPC (M4): `record_item_review(item_id, rating, mode, expected_review_count)`

- `security definer`, `set search_path = ''`; `execute` only for `authenticated`. Identity from `auth.uid()`.
- The only way a learner's own review moves an item's schedule: locks the item (`for update`), applies SM-2 lite,
  updates the item and inserts one `review_logs` row in one transaction. Returns
  `(applied, review_count, interval_days, ease, mastery_score, next_review_at)`.
- Another user's item raises `P0002` exactly like a missing one. `mode` is `recall` or `use_in_sentence`;
  `conversation` is reserved for the M7 review RPC.
- `expected_review_count` is an optimistic-concurrency guard: a double submit or stale tab gets `applied = false`
  and the current state, so one answer can never move the schedule twice.
- The rules mirror `src/lib/domain/scheduling.ts`; `tests/db/scheduling.test.ts` checks both agree on 69 rating
  sequences (including the ease floor/ceiling and the 365-day cap).
- The same migration fixed `learning_items_ease_check`: `ease` is `real`, and comparing it with the numeric
  `1.3` happened in double precision, where the stored real 1.3 is 1.2999999523…, so the minimum ease was
  rejected. The check now compares as `real`.

### Review application RPC (M7): `apply_conversation_review(conversation_id, review jsonb, events jsonb)`

Implemented in M7 (migration 0700) and extended with language events in M8 (migration 0800). See
ARCHITECTURE.md → Conversation state.

- `security definer`, `set search_path = ''`, `execute` only for `authenticated`; identity from `auth.uid()`.
  Another user's conversation raises `P0002` like a missing one.
- Locks the conversation. `completed` → returns `false` and writes nothing (replay is a no-op); any status other
  than `reviewing` raises `55000`.
- One transaction: `conversation_feedback`, up to 8 `corrections` (position = array index; each must point at a
  **learner** message of this conversation, else `22023`; taxonomy pairs via the composite FK), then
  `conversation_targets.used_naturally` for target items. An item used naturally gets one `review_logs` row
  (`mode = conversation`, rating `good`) and moves by the same SM-2 lite `good` rule as `record_item_review`;
  the partial unique index makes that at most once per conversation. Items that weren't targets are ignored.
- M8: up to 60 `language_events` (`{ messageId, eventType, category, subCategory, original, suggestion, context,
  confidence }`), each on a learner message of this conversation (else `22023`). Each event's gap is found or
  created for `(user, category, sub_category)` with the fixed title/description from `gap_taxonomy`, and the event
  is linked to it; the natural key makes replays harmless. An invalid pair fails the composite FK.
- Finally `status = completed`, `completed_at`, and `overall_score` = rounded mean of the five indicators, then
  `recompute_language_gaps(user)`.

### Gap recompute (M8): `recompute_language_gaps(user_id)`

Internal (`execute` revoked from every client role; called by the RPCs). Recomputes **all** of the user's gaps
from their linked events in one set-based `update`, mirroring `src/lib/domain/gaps.ts` (docs/AI_SYSTEM.md → Gap
detection): evidence = confidence ≥ 0.6 (compared as `real`), aggregates over negative evidence, status from the
full history (`dismissed` sticky), severity from the last 336 hours (14 × 24 h), resolved after 720 hours. Only
rows whose values change are written. Recomputing every gap on every review lets time-based changes apply.
`tests/db/gaps.test.ts` checks SQL and TypeScript agree on 252 random histories that reach every status and
severity.

`restore_gap(gap_id) returns text`: undoes a dismissal (another user's gap → `P0002`), recomputes and returns the
gap's status. Clients can still only set `status = 'dismissed'` directly.

`gap_taxonomy` has `title` and `description` (M8), equal to `GAP_DETAILS` in taxonomy.ts (checked by the test).

`claim_conversation_review(conversation_id) returns text` (M7) starts a review attempt with the database clock:
`failed_review`, an unclaimed `reviewing` (`review_started_at` null, e.g. ended in M6) or one started over 5
minutes ago → sets `reviewing`, `review_started_at = now()`, `review_attempts + 1`, clears `review_error`, returns
`claimed`. Otherwise returns `in_progress`, `completed`, `active` or `abandoned` without changes.

**Client status guard (M7).** Trigger `conversations_guard_status` limits status changes made directly by
`authenticated` to `active → reviewing` (End), `active → abandoned` and `reviewing → failed_review` (with
`review_error`). `completed` and retries go through the RPCs above. `review_started_at` / `review_attempts`
are no longer client-writable.

## Indexes

`(user_id, started_at desc)` conversations · `(user_id, next_review_at)` learning_items ·
`(user_id, status, severity)` language_gaps · `(gap_id, created_at)` language_events · `(user_id, created_at desc)`
on events/debriefs · FK columns used in joins.

## Verification status

See docs/TASKS.md → "Database verification".
