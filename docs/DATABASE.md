# FluentLab — Database

Supabase Postgres. All ids `uuid default gen_random_uuid()`, timestamps `timestamptz default now()`.

## Learner model chain

```
profiles ─┬─ conversations ─┬─ messages
          │                 ├─ conversation_feedback (1:1)
          │                 ├─ corrections ──(saved as)──> learning_items
          │                 └─ language_events ──(aggregate into)──> language_gaps
          ├─ learning_items ── review_logs
          ├─ language_gaps ──(drive)──> recommendations / scenario targets
          ├─ debriefs ──(spawn)──> conversations (custom scenario)
          └─ ai_usage
scenarios (shared catalog), curated_expressions (shared)
```

## Tables

**profiles** (PK = `auth.users.id`)
`id, display_name, native_language, english_level (self-rated: intermediate|upper_intermediate|advanced),
learning_goal text, contexts text[] (campus|social|everyday|career|travel), daily_goal_minutes int default 20,
timezone, onboarded_at, created_at`

**scenarios** (shared)
`id, slug unique, category, title, description, user_role, ai_role, ai_personality, goal, difficulty,
opening_line, system_prompt, est_minutes, is_custom bool, created_by uuid null, created_at`
Custom scenarios (`is_custom = true`) belong to `created_by`.

**conversations**
`id, user_id, scenario_id, scenario_snapshot jsonb, target_item_ids uuid[], target_gap_ids uuid[],
status (active|reviewing|completed|failed_review|abandoned), user_turns int, started_at, completed_at,
overall_score int null`

**messages**
`id, conversation_id, user_id, role (user|assistant), content, seq int, created_at` — unique `(conversation_id, seq)`

**conversation_feedback** (1:1 conversation)
`id, conversation_id unique, user_id, summary, overall_label, fluency_score, naturalness_score,
grammar_score, vocabulary_score, confidence_score, strengths text[], target_items_used jsonb, model, created_at`

**corrections**
`id, conversation_id, user_id, message_id, original, improved, category (naturalness|grammar|vocabulary|pragmatics|register),
explanation, is_grammatical bool, saveable_expressions jsonb, created_at`

**learning_items**
`id, user_id, type (word|phrase|expression|grammar), expression, meaning, native_meaning, example,
details jsonb (studio card), source (studio|review|debrief|curated), source_id uuid null,
mastery_score real 0–1, ease real default 2.5, interval_days int, next_review_at, times_used_in_conversation int,
last_used_at, created_at` — unique `(user_id, lower(expression))`

**review_logs**
`id, user_id, item_id, rating (again|hard|good|easy), mode (recall|use_in_sentence), created_at`

**language_events** (atomic evidence, one per detected issue)
`id, user_id, conversation_id, message_id null, event_type (unnatural_expression|grammar_error|overly_direct|
register_mismatch|limited_vocabulary|missed_opportunity|good_usage), category, sub_category, original,
suggestion, context, confidence real, gap_id null, created_at`

**language_gaps** (aggregated learner model)
`id, user_id, category, sub_category, title, description, severity (low|medium|high), confidence real,
evidence_count int, conversations_count int, first_detected_at, last_detected_at, last_practiced_at,
status (active|improving|resolved|dismissed), created_at` — unique `(user_id, category, sub_category)`

**debriefs**
`id, user_id, situation text, what_user_said text null, result jsonb (phrasings, explanation),
scenario_id null (generated custom scenario), created_at`

**ai_usage**
`user_id, day date, calls int` — PK `(user_id, day)`; incremented via `security definer` RPC.

**curated_expressions** (shared seed content for /expressions)
`id, expression, meaning, used_when, example, register, frequency int 1–5, details jsonb`

## Gap taxonomy (src/lib/domain/taxonomy.ts, enforced by Zod enum)

- `pragmatics`: polite_requests, conversation_closing, conversation_opening, disagreeing_politely, small_talk, turn_taking
- `natural_expression`: phrasal_verbs, collocations, idioms, filler_and_softeners, word_choice
- `grammar`: articles, tenses, prepositions, word_order, agreement
- `vocabulary`: academic, everyday, range_repetition
- `register`: too_formal, too_casual

## RLS strategy

- Enable RLS on every table.
- User-owned tables (`profiles` by `id`, all others by `user_id`): select/insert/update/delete
  `using (user_id = auth.uid()) with check (user_id = auth.uid())`. `user_id` defaults to `auth.uid()`.
- `messages`, `corrections`, `language_events` additionally check the parent conversation belongs to the user
  on insert (`exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid())`).
- `scenarios`: select where `is_custom = false or created_by = auth.uid()`; insert only `is_custom = true and created_by = auth.uid()`.
- `curated_expressions`: select for `authenticated`; no write policies.
- `ai_usage`: select own; writes only through `increment_ai_usage()` RPC.
- Trigger `on_auth_user_created` inserts an empty `profiles` row.
- Indexes: `(user_id, created_at desc)` on conversations/events, `(user_id, next_review_at)` on items,
  `(user_id, status, severity)` on gaps, `(conversation_id, seq)` on messages.
- RLS test: two seeded users; assert cross-user reads return 0 rows.
