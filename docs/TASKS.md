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

## M8 — Gap Tracker (extractor, deterministic aggregation, gap pages) ✅
- Decisions 2026-10-29: reviewer + extractor in **one** AI call; conversations reviewed in M7 are not re-analysed.
- [x] Step 1: `domain/gaps.ts` — evidence threshold, activation, improving/resolved since the last negative event,
      14-day severity, sticky dismissed, as a pure function of the event history; `GAP_DETAILS` titles and
      descriptions per sub-category; unit tests (`tests/unit/domain-gaps.test.ts`)
- [x] Step 2: migration 0800 — `gap_taxonomy.title/description`, internal `recompute_language_gaps` (SQL mirror of
      domain/gaps.ts, all of the user's gaps on every review), `apply_conversation_review` with language events
      (learner messages only, gap found or created, replay-safe), `restore_gap`; PGlite: SQL = TS on 252 random
      histories covering every status and severity; applied on the Supabase project; `db:verify-rls` 61/61
      (11 new gap checks); `test:e2e:live` 9/9
- [x] Step 3: `reviewer-v2` — events in the same call (`ReviewEventOutputSchema`), resolution (unknown refs, invented
      quotes, one per natural key, 2-decimal confidence), mock events, `runReviewAction` passes `p_events`;
      `test:e2e:live` 9/9 (mock review → "Word choice" gap active in the real database)
- [x] Step 4: review page "Patterns from this conversation" (`getConversationPatterns`: evidence ≥ 0.6 from this
      conversation per gap, current status; "Watching" for emerging gaps, which aren't links; good usage shown as
      "done well"); `test:e2e:live` checks it after a mock review
- [x] Step 5: Gap Tracker — `/gaps` (Focus areas / Improving / Resolved, dismissed collapsed; severity, "Seen N× in
      M conversations", last seen; empty and unconfigured states), `/gaps/[id]` (description, counts, evidence
      "You said → More natural" linked to the review, good usages, Dismiss with confirm / Restore via
      `restore_gap`); `data/gaps.ts`, `actions/gaps.ts`, shared `gap-badges.tsx`; `test:e2e:live` gaps 1/1
- [x] Live Gemini check of `reviewer-v2` (2026-10-30): first attempt got **400 INVALID_ARGUMENT** — the combined
      corrections + events schema was too complex for Gemini; `geminiSchema` now strips size constraints
      (`minLength`/`maxLength`/`minItems`/`maxItems`/`minimum`/`maximum`) that Gemini doesn't enforce (Zod still
      checks them). Then passed in ~13 s: articles (grammar_error 0.9), "Explain it to me again" (overly_direct
      0.95), "walk me through" (good_usage 0.95), nothing dropped
- [x] Step 6: manually checked by the learner with Gemini (end → review → patterns → Gap Tracker, dismiss/restore,
      Today focus areas); `vitest.config.mts` caps `maxWorkers` at 8 (31 parallel workers on a 32-thread machine
      missed Vitest's start-up timeout, likely the unexplained `npm test` exit 1 seen in M6)
- [x] Fix found while closing M8: "due now" compared the database-set `next_review_at` with the app server's
      clock, so ~1 s of skew made an item added a moment ago look not due (`test:e2e:live` My English failed once).
      `isDue` / `dueCutoff` in `src/lib/items.ts` now count items due within 60 s as due, used everywhere

## M9 — Recommendations + Reuse (targets in scenarios, Today plan, Fluency Profile charts) ✅
- Decision 2026-11-02: every new conversation targets the top-ranked open gap automatically ("Practice this" on a
  gap picks that one instead), shown as "Focus" on the brief; the tutor creates chances without naming it.
- No migration needed: gap targets (`conversation_targets.gap_id`) and "3 targeted conversations → improving"
  exist since M1/M8.
- [x] Step 1: `gapPriority` / `rankGaps` (severity × 14-day half-life × 0.25 if practiced in the last 2 days, × 0.5
      if improving), exported `pickScenario`; last practice derived per gap (`lastPracticedByGap`, completed
      targeting conversations); Today uses it; unit tests
- [x] Step 2: gap targets — `chooseFocusGap` (requested `?gap=` / `gapId` if the learner's and open, else top
      ranked), `startConversationAction` stores it in `conversation_targets` (resumes add nothing), "Focus" on
      the brief and in the chat header, "Practice this" on active/improving gaps (`pickScenario`);
      `test:e2e:live` gaps: Practice this → focused brief → start → gap target stored
- [x] Step 3: `tutor-v2` (focus gap as escaped data; create chances, never name it) and `reviewer-v3` (looks for the
      focus skill), passed from the chat route, the opening line and the review; unit tests; live Gemini check (3
      requests): no mention of the skill, overly_direct + good_usage recorded for "Polite requests"
- [x] Step 4: Today's conversation recommendation links to `?gap=` (focused brief) with "seen N× in M
      conversations"; item detail shows "Used in conversations" (count of `used_naturally` targets, not stored);
      `test:e2e:live` gaps: Today plan → focused brief
- [x] Step 5: Fluency Profile (`/profile`) — recharts 3.10.1 + react-is 19.3.0 (pinned, released ≥ 2 weeks before);
      small multiples per indicator (shared 0–100 scale, hover tooltip), latest value and trend (last 3 reviews vs
      earlier, "steady" under 2 points, needs 4 reviews), table view, gap counts, empty state under 2 reviews;
      `domain/indicators.ts`, `data/profile.ts`; `test:e2e:live` profile 1/1 (screenshot checked)
- [x] Step 6: manually checked by the learner on 2026-11-03 (Fluency Profile, Today → focused brief, Practice
      this); `npm audit` could not run (the configured npm registry mirror has no audit endpoint)

## M10 — Real-Life Debrief ✅
- Decision 2026-11-03: a debrief is saved only after the coach succeeds (no draft/failed rows); on failure the
  form keeps the learner's text. No migration: `debriefs`, its RLS and the own-custom-scenario FK exist since M1.
- [x] Step 1: `DebriefInputSchema` (2000-char limits), `DebriefResultSchema` (3–5 phrasings, explanation, ≤ 3
      expressions, a scenario within custom-scenario limits), `debrief-v1` prompt (escaped data), `coachDebrief`,
      mock fixture; unit tests (the mock scenario passes `CustomScenarioSchema`); live Gemini check (1 request)
- [x] Step 2: `/debrief` — form (controlled fields submitted with startTransition, so text survives a failure;
      character counts; one-AI-request note), list of past debriefs; `createDebriefAction` (validate → quota →
      coach → save `result` + model → open it; nothing saved on failure); `data/debriefs.ts`; unit + component
      tests; `test:e2e:live` debrief 1/1
- [x] Step 3: `/debrief/[id]` — situation and what you said, phrasings grouped Casual / Neutral / Formal, why,
      sample notice; "Add to My English" (`saveDebriefExpressionAction`: text read from the stored result, a phrasing
      that uses it as the example, `source = debrief`); delete with confirm (saved items stay, link cleared); item
      pages link back ("Saved from a real-life debrief"); `SaveExpressionButton` moved to shared and takes its
      action; `test:e2e:live` debrief: show → save → reload → delete
- [x] Step 4: "Practice this situation" (`practiceDebriefAction`): the coach's scenario passes `CustomScenarioSchema`
      (a null opening line → blank), 50-scenario limit, saved as the learner's custom scenario and linked with a
      conditional update (`scenario_id is null`; a losing double click deletes its copy and follows the winner);
      "Open your practice scenario" afterwards; deleting the scenario clears the link (FK) and offers it again;
      preview of the scenario on the result page; unit tests incl. the race; `test:e2e:live` debrief: practice →
      brief → start conversation, one scenario only
- [x] Step 5: manually checked by the learner on 2026-11-03 with Gemini (debrief → phrasings → save → practice)

## M11 — Testing + polish (golden-path E2E, a11y, empty/error states) ✅
- [x] Step 1: `tests/e2e-live/golden-path.spec.ts` — the V1 key user flow in one run (real Supabase, mock AI):
      sign in → onboarding (4 steps, real UI) → Today → Office Hours → end → review (annotated, expression saved) →
      gap in the Gap Tracker → Today recommends it → focused brief → focused conversation; profile values checked
      in the database. Starts at sign-in, not the sign-up form (each sign-up sends a real email through
      Supabase's rate-limited built-in mailer; sign-up is unit-tested and was checked by hand in M2)
- [x] Step 2: accessibility — `@axe-core/playwright` 4.14.0 (pinned); `tests/a11y.ts` fails on serious/critical WCAG
      2.1 A/AA violations. CI: 16 pages × desktop/mobile + skip-link keyboard check (clean first time; a probe
      confirmed axe ran ~20 rules per page). Live: onboarding, Today (new / with a gap), chat, review, Gap Tracker,
      gap detail, focused brief, My English, history, Fluency Profile, debrief. Found and fixed: text tokens below
      4.5:1 on their soft tints (coral 3.79, destructive 4.01, warning 4.30, primary 4.30 → darkened, same hues,
      now 4.6–4.7; DESIGN_SYSTEM table synced with the code), and Recharts 3's keyboard layer inside the
      aria-hidden chart (`accessibilityLayer={false}`; the table is the accessible view)
- [x] Step 3: states audit of all 25 pages (loading / empty / error / unconfigured / not found). Every `(app)` page
      streams behind Suspense with a skeleton (plus the group's `loading.tsx`), handles unconfigured mode (directly
      or via `BriefPage` / `ItemDetailPage`), shows an empty state with a next step, and uses `notFound()` for
      missing or someone else's rows; data loaders throw a generic "Could not load …" caught by `(app)/error.tsx`
      (digest logged only). Gap found and fixed: landing, sign-in, sign-up and onboarding had no boundary of their
      own and fell through to `global-error.tsx`, which drops the root layout; added `src/app/error.tsx`. Unit
      tests: all three boundaries show a friendly message and Try again, never the error text
- [x] Step 4: demo seed rewritten for M7–M10 (it predated them: incomplete snapshots, no corrections, hand-set gap
      statuses with custom titles, a debrief without a result): 7 reviewed conversations over 40 days with
      corrections, saveable expressions and rising indicators, events whose gaps are computed by
      `recompute_language_gaps` (focus/high, focus/low, improving, resolved, emerging), reuse targets, a debrief
      with its practice scenario; checked by signing in as the demo (pages, axe, screenshots). Fixed "last
      saturday" / "last sep 24" (`pastDayInline`). README and ARCHITECTURE → Testing strategy rewritten to match
      what actually runs
- [x] Step 5: full run before closing — format, lint, typecheck, unit/database, build, `test:e2e`, `test:e2e:live`,
      `db:verify-rls`

## M12 — Vercel deployment + production Supabase
- Decision 2026-11-03: a Preview-only deployment first, on the development Supabase project with Gemini's free
  tier, sign-up closed and test accounts only; Production stays unconfigured until an independent database exists.
  Steps in [docs/DEPLOYMENT.md](DEPLOYMENT.md).
- [x] `preview` branch (Vercel Preview), Preview-scoped variables, `docs/DEPLOYMENT.md`
- [ ] Custom SMTP for Supabase Auth (built-in email only reaches org members and is heavily rate-limited;
      templates can't be edited without it)
- [ ] Switch "Confirm signup" and "Magic Link" templates to
      `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` so links work on any device
      (`/auth/callback` already handles both `token_hash` and `code`)
- [ ] Add the production URL to Supabase Redirect URLs and set `NEXT_PUBLIC_SITE_URL`
