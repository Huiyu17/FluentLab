# FluentLab — Tasks

Work on one milestone at a time. Each milestone ends with lint, typecheck, test and build passing,
and this file updated.

## M0 — Architecture + documentation ✅
- [x] CLAUDE.md, PRODUCT, ARCHITECTURE, DATABASE, AI_SYSTEM, DESIGN_SYSTEM, TASKS
- [x] Review fixes before schema: unified taxonomy + pair validation, gap `emerging` state and
      single-event severity, same-owner FKs, custom scenario permissions, quota RPC, review idempotency

## M1 — Project shell + design system ✅
- [x] Scaffold Next.js 16.4 (App Router, TS strict, src/, Turbopack, cacheComponents), Tailwind 4, shadcn/ui (Radix)
- [x] Prettier, Vitest, Playwright config; scripts: lint, typecheck, test, test:e2e, build, format
- [x] Design tokens + fonts (Inter, Fraunces) per DESIGN_SYSTEM.md
- [x] App shell: responsive sidebar (desktop) + sheet (mobile), page header, placeholder pages for every route
- [x] Shared EmptyState / ErrorState / PageSkeleton, loading.tsx, error.tsx, global-error.tsx, not-found.tsx
- [x] `.env.example`; Supabase env/browser/server/proxy/admin clients; unconfigured mode with setup notice
- [x] Initial migrations (schema + RLS + grants + quota RPC) and seed (8 scenarios, 8 curated expressions)
- [x] Migration/RLS tests on PGlite; taxonomy TS ↔ SQL consistency test
- [x] GitHub Actions CI (format, lint, typecheck, test, build, e2e)

### Database verification

| Check | Status |
|---|---|
| Migrations apply in order on Postgres (PGlite 0.5.12 = Postgres 18; schema needs ≥ 15 for `on delete set null (col)`) | ✅ automated (`npm test`) |
| Same migrations on the Postgres version a Supabase project runs (15/17) | ✅ applied on the Supabase project (Postgres 17) |
| RLS isolation, same-owner FKs on INSERT/UPDATE, column grants, quota RPC limit | ✅ automated on PGlite with a stubbed `auth` schema and roles |
| Seed is idempotent | ✅ automated on PGlite |
| Migrations apply on a real Supabase project (Supabase's own roles, default privileges, `auth.users`) | ✅ applied via SQL Editor; anon is denied on every app table and on `consume_ai_quota()` through the Data API |
| `on_auth_user_created` trigger with the real Supabase Auth signup flow | ✅ manual sign-up on 2026-10-28: `profiles` row created with `display_name` from sign-up metadata, `onboarded_at` null |
| RLS through PostgREST with real JWTs (supabase-js as two users) | ✅ `npm run db:verify-rls` on 2026-10-28, 26/26: own-row isolation (read/update/delete), spoofed `user_id` inserts, column grants (`profiles.created_at`, `learning_items.mastery_score`, `debriefs.user_id`), custom scenario privacy, same-owner FK, quota RPC + `ai_usage`, anon denied |
| `consume_ai_quota()` under true concurrent requests | ✅ `npm run db:verify-quota` on 2026-10-29: 210 concurrent calls with a daily limit of 200 → exactly 200 allowed, 10 denied, stored count 200, every allowed call got its own count |

The PGlite tests check Postgres semantics only. They don't exercise Supabase itself, so after any
migration that touches RLS or grants, apply it to the Supabase project and rerun `npm run db:verify-rls`.

## M2 — Auth + onboarding ✅
- [x] Create a Supabase project and apply migrations + seed
- [x] Complete the pending rows in "Database verification" above (quota concurrency moved to M6)
- [x] Email/password + magic link via Supabase Auth; `/auth/callback`
      (manually verified against the real project: sign-up → confirmation link (`?code=`) → `/onboarding`,
      password sign-in, wrong password, magic link for an unknown email, invalid link → `/login`, and (in M6) a
      magic link for an existing account. Unit tests cover the actions and callback.)
- [x] Data access layer: `src/lib/auth/dal.ts` (`getCurrentUser`, `requireUser`, `requireOnboardedUser`)
- [x] Proxy redirect for signed-out users (and signed-in users away from /login, /signup), onboarding gate,
      sign-out button (manually verified on the real project: /today → /onboarding while not onboarded,
      /login → away when signed in, sign out → /login, signed out /today → /login?next=%2Ftoday → back
      after sign-in. `createClient()` calls `connection()` so Supabase's `Date.now()` expiry checks
      never run during prerendering.)
- [x] Onboarding wizard (native language, level, goal, contexts, daily minutes)
      (manually verified on the real project: 4 steps with per-step validation, Finish sets `onboarded_at`
      and goes to /today. Forms submit via `startTransition` instead of `<form action>` because React's
      post-action form reset reverted controlled radios/checkboxes on screen.)
- [x] Settings page edits profile (manually verified: changes stay on screen after Save, sidebar name
      updates, values persist after reload)
- [x] Generate `src/lib/supabase/types.ts` from the schema (`npm run db:types`, Supabase CLI 2.120.0);
      server, browser and admin clients are typed with `Database`
- [x] RLS verified on the real project with two users (`npm run db:verify-rls`)

## M3 — Today dashboard (static data sources wired, recommendations stubbed) ✅
- [x] Domain: `streak.ts` (learner's time zone; a missed today doesn't break it, a missed yesterday does)
      and rule-based `recommendations.ts` (conversation from the learner's contexts or for the top gap,
      review when items are due, one Studio suggestion; each with a reason). Full ranking formula → M8.
- [x] `src/lib/data/today.ts`: 10 parallel queries under RLS; only `active`/`improving` gaps are shown;
      streak looks back 90 days. Select strings checked against the real schema.
- [x] Today UI: plan, streak, reviews, focus areas, recent activity, indicators (captioned
      "AI-estimated learning indicators"); loading skeleton, per-card empty states, error boundary,
      unconfigured notice
- [x] `npm run db:seed-demo`: demo account for a populated dashboard (manually checked on 2026-10-29)

## M4 — Vocabulary / Expression Studio + My English + review session (`record_item_review` RPC) ✅
- [x] `record_item_review` RPC (migration 0600) with SM-2 lite in SQL, mirrored by `domain/scheduling.ts`;
      PGlite test: SQL and TS agree on 69 rating sequences. Fixed `learning_items_ease_check` (real vs numeric
      at 1.3). Applied on the Supabase project; `db:verify-rls` 32/32 (6 new review checks)
- [x] AI layer skeleton: provider interface, mock provider + Studio fixtures, `generateObject` (Zod → one repair
      retry → `invalid_output`), `AIError`, quota before every call, Studio prompt with learner text as data
- [x] Vocabulary / Expression Studio: explain (mock cards labelled as samples), save to My English (re-validated,
      duplicate-safe), curated list, item detail + delete. Saved state comes from the server, not kept page state
- [x] My English: overview, URL filters (type, due), list
- [x] Review session: reveal, optional sentence, Again/Hard/Good/Easy with interval previews, keys 1–4,
      "Again" requeues, fresh session per visit
- [x] `npm run test:e2e:live`: real-Supabase E2E as a throwaway user (save → delete → "Add" again; curated →
      review → not due). Manually checked by the learner on 2026-10-29

## M5 — Scenario catalog + scenario brief + custom scenario ✅
- [x] `CustomScenarioSchema` (limits checked against the migration SQL), `data/scenarios.ts`
      (`system_prompt` never selected; custom scenarios scoped to their owner)
- [x] `/simulator` catalog: recommended from the learner's contexts, other categories, "Your scenarios"
- [x] Scenario brief for shared (`/simulator/[slug]`) and custom (`/simulator/custom/[id]`) scenarios, with
      "Expressions you could use" from `domain/targets.ts`. Start stays disabled until M6 (no half-usable
      conversation rows)
- [x] Custom scenarios: create, edit, delete (ownership set server-side, 50 per account, inline delete confirm)
- [x] `db:verify-rls` 36/36 (B can't edit/delete A's custom scenario, A can't edit a shared one);
      `test:e2e:live` 4/4 (scenario lifecycle + not-found). Manually checked by the learner on 2026-10-29
- Note: not-found inside a streamed (Suspense) page renders the not-found UI with HTTP 200 + noindex,
  because the status is sent before `notFound()` runs. Fine for signed-in pages.

## M6 — AI conversation system (choose provider + verify model ids, provider abstraction, tutor, streaming chat, conversation state) ✅
- [x] Provider: **Gemini** (`@google/genai` 2.29.1) instead of Anthropic, to develop on the free tier. Model ids from
      env only; `gemini-3.6-flash` verified with `npm run test:ai` (text, stream, Studio card, tutor). Free tier on
      this project: 5 requests/minute per model. 429 → `provider_quota` (never retried, never switched to a paid
      service); key rejected → `provider_auth`; safety → `blocked`; empty answer → `invalid_output`; 30 s / 60 s
      timeouts, one retry for 5xx only. `gemini-3.8-flash` was overloaded on 2026-10-29.
- [x] Tutor prompt + service: rules in the system prompt, scenario/learner/targets as escaped data in the first user
      turn; live check: stays in character and won't correct grammar when asked to
- [x] Start conversation (snapshot, targets from `domain/targets.ts`, opening line settled before any write,
      cleanup on failure, resume an active conversation on the same scenario within 24 h)
- [x] `POST /api/conversations/[id]/messages`: NDJSON stream; validation, ownership, active status, 30-turn cap,
      unique seq for double submits; AI failures keep the learner's message and the reply can be retried; the reply
      is stored even if the learner leaves mid-stream
- [x] Chat UI (pinned brief, named partner, streaming, Enter/Shift+Enter, retry, turn warning, sample notice) and
      End conversation (`active → reviewing`, conditional update)
- [x] Verify `consume_ai_quota()` under concurrent requests on the Supabase project (carried over from M2):
      `npm run db:verify-quota`
- [x] `test:e2e:live` 6/6, including start → chat → reload → resume → end, and an AI-written opening line (mock AI)
- [x] Click a magic link for an existing account once (carried over from M2): manually verified by the learner on
      2026-10-29 (sign-in link → signed in → /today)
- Decision 2026-10-29: no feedback during the conversation (PRODUCT.md principle 1, and per-message review would
  double AI calls on a 5/min free tier). The learner asked for sentence-by-sentence feedback: M7 does it after the
  conversation instead (below).

## M7 — Conversation Review (reviewer service, `apply_conversation_review` RPC, corrections, save expressions) ✅
- Review page layout (agreed 2026-10-29): the transcript with each learner message annotated in place ("What you
  said → More natural → Why"), plus a summary on top (overall summary, the five AI-estimated learning
  indicators, strengths, expressions worth saving). One reviewer call per conversation.
- Messages without a correction are **not** marked as correct (the reviewer picks at most 8 corrections, so the
  rest are only "not selected"): no mark, or a quiet "No suggestions" note (learner's request, 2026-10-29).
- Picks up conversations already in `reviewing` (ended during M6).
- Decisions 2026-10-29: End goes straight to `/conversations/[id]/review`, which runs the review with a progress
  UI (free-tier calls can take 20–40 s); gap events stay in M8 (`p_events` must be empty until then).
- [x] Step 1: migration 0700 — `apply_conversation_review` (single writer, replay no-op, learner-message check,
      Reuse scheduling with the `good` rule), `claim_conversation_review` (5-minute stale reclaim), client status
      guard trigger; PGlite tests (`tests/db/conversation-review.test.ts`); applied on the Supabase project;
      `db:verify-rls` 50/50 (14 new review checks); `test:e2e:live` 6/6 (End still works with the guard)
- [x] Step 2: reviewer — `ReviewOutputSchema` (refs, taxonomy pairs, ≤ 8 corrections), `reviewer-v1` prompt
      (transcript as escaped data), `reviewConversation` + `resolveReview` (drops unresolvable refs and quotes
      the learner didn't write), mock fixture; unit tests; live Gemini review checked once (~11 s)
- [x] Step 3: running the review — End → `/conversations/[id]/review` (empty conversations → `abandoned`),
      `runReviewAction` (claim → reviewer → apply; failures → `failed_review` + code), `ReviewRunner` (progress,
      another-tab wait, Try again, no automatic retry after a failure); `test:e2e:live` 7/7 (end → mock review →
      completed, no double review on reload, failed review → Try again, empty conversation abandoned)
- [x] Step 4: review page — summary (label, five captioned indicators, strengths, expressions worth saving with
      server-derived saved state), transcript annotated in place ("No suggestions" for uncorrected turns),
      sample notice for mock reviews, next-step links; `saveReviewExpressionAction` (text read from the stored
      correction, `source = review`, linked to conversation + correction); item page links back to the review;
      `test:e2e:live` 8/8
- [x] Step 5: Conversation History (`/conversations`) — newest first, 20 per page with a `started_at` cursor
      ("Older conversations"), title, status chip, date, learner turns, overall label; links to the review or the
      chat (`conversationHref`, shared with Today's recent activity); empty and unconfigured states;
      `test:e2e:live` 9/9
- [x] Step 6: Today's recent activity links ended conversations to their review (checked in `test:e2e:live`);
      docs updated. Manually checked by the learner on 2026-10-29 with Gemini: end → review → summary, and an
      M6-era conversation reviewed on open

## Backlog (after V1 core)
- On-demand "How could I say this?" help during a conversation (only when the learner asks; shown as a side note,
  the character stays in the scene). Needs a PRODUCT.md principle change first.

## M8 — Gap Tracker (extractor, deterministic aggregation, gap pages)

## M9 — Recommendations + Reuse (targets in scenarios, Today plan, Fluency Profile charts)

## M10 — Real-Life Debrief

## M11 — Testing + polish (golden-path E2E, a11y, empty/error states)

## M12 — Vercel deployment + production Supabase
- [ ] Custom SMTP for Supabase Auth (built-in email only reaches org members and is heavily rate-limited;
      templates can't be edited without it)
- [ ] Switch "Confirm signup" and "Magic Link" templates to
      `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` so links work on any device
      (`/auth/callback` already handles both `token_hash` and `code`)
- [ ] Add the production URL to Supabase Redirect URLs and set `NEXT_PUBLIC_SITE_URL`
