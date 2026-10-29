# FluentLab — Architecture

## Overview

```
Browser (React Server + Client Components)
   │
Next.js App Router (Vercel)
   ├─ Server Components ── read data via Supabase server client (RLS as the user)
   ├─ Server Actions ───── mutations (save item, end conversation, update gap status)
   └─ Route Handlers ───── streaming AI chat (/api/conversations/[id]/messages)
   │
   ├─ src/lib/ai ───────── provider abstraction + services (tutor, reviewer, gap extractor, studio, debrief)
   ├─ src/lib/domain ───── deterministic logic (gap aggregation, scheduling, recommendations)
   └─ src/lib/supabase ─── env / browser / server / proxy / admin clients
   │
┌──────────────────────┬──────────────────────┐
│ Supabase             │ LLM provider         │
│ Auth + Postgres+RLS  │ Anthropic (default)  │
└──────────────────────┴──────────────────────┘
```

Key decisions:
- **Single Next.js app, no Python backend.** All V1 workloads are request/response or short streams.
- **RLS is the authorization layer.** Server code uses the user-scoped Supabase client. The service-role
  client (`admin.ts`) is only for seeding scenarios and is never imported by user-facing code paths.
- **AI behind interfaces.** Services depend on an `LLMProvider` interface (`generateText`, `streamText`,
  `generateObject<T>(schema)`). Anthropic implementation first; OpenAI is a drop-in. A `mock` provider
  powers tests and keyless local dev.
- **LLM proposes, code decides.** The LLM extracts language events; TypeScript aggregates them into gaps,
  computes severity, schedules reviews and ranks recommendations. This keeps the learner model
  explainable ("seen 9 times in the last 14 conversations").
- **Post-processing is synchronous in V1.** "End conversation" runs review + event extraction in one
  server action (~10–20 s) with a progress UI. If it gets slow, move to a queued job in V2.

## Route structure

```
/                         marketing landing (public)
/login, /signup           auth (public)
/auth/callback            Supabase OAuth / magic-link callback
/onboarding               4-step onboarding (required before app)

(app) — authenticated layout with sidebar
/today                    dashboard
/vocabulary               Studio: look up word, see saved words
/vocabulary/[itemId]      saved word detail
/expressions              Studio for phrases / native expressions + curated list
/expressions/[itemId]
/my-english               all saved learning items + due reviews
/my-english/review        review session (flashcard + "use it in a sentence")
/simulator                scenario catalog by category
/simulator/[scenarioSlug] scenario brief → Start
/simulator/custom         create custom scenario
/simulator/custom/[id]    custom scenario brief (owner only; custom scenarios have no slug) → Edit / Delete
/simulator/custom/[id]/edit  edit custom scenario
/conversations            history
/conversations/[id]       live chat (if active) or transcript
/conversations/[id]/review  Conversation Review
/debrief                  Real-Life Debrief list + new
/debrief/[id]             debrief result → "Practice this situation"
/gaps                     Gap Tracker
/gaps/[id]                gap detail with evidence events
/profile                  Fluency Profile (indicator trends)
/settings                 profile, goals, native language, account

/api/conversations/[id]/messages   POST, streams tutor reply
```

`src/proxy.ts` (Next.js 16 renamed `middleware` to `proxy`) refreshes the Supabase session cookie and does
an *optimistic* redirect of signed-out users from `(app)` to `/login` (M2). Real authorization happens close to
the data: in the data access layer, in each Server Action and Route Handler, and in RLS. The onboarding redirect
is done in the app layout's data access layer, not in the proxy (the proxy must not do slow DB reads).

**Unconfigured mode (M1).** If `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing,
the app still starts. The proxy is a pass-through, pages render the shell, and a banner explains that Supabase
is not configured and points to `.env.example`. Supabase clients are created lazily through
`getSupabaseEnv()`, which returns `null` instead of throwing.

**Next.js 16 specifics.** `cacheComponents` is on. Anything that reads the request (cookies, session) sits
behind `<Suspense>`; shared chrome (sidebar) is static and prerenders into the shell. Turbopack is the default
bundler. `next lint` no longer exists, so lint runs ESLint flat config directly.

## Folder structure

```
src/
  app/
    (marketing)/page.tsx
    (auth)/login, signup, auth/callback
    onboarding/
    (app)/layout.tsx            sidebar shell
    (app)/today, vocabulary, expressions, my-english, simulator,
          conversations, debrief, gaps, profile, settings
    api/conversations/[id]/messages/route.ts
  components/
    ui/                         shadcn primitives
    shell/                      Sidebar, TopBar, PageHeader
    today/ studio/ simulator/ review/ gaps/ items/ debrief/ charts/
    shared/                     EmptyState, ErrorState, ScoreRing, Skeletons
  lib/
    supabase/ env.ts client.ts server.ts proxy.ts admin.ts
              types.ts          generated by `npm run db:types` (needs `npx supabase login`);
                                regenerate after every migration, never edit by hand
    auth/dal.ts                 data access layer: getAuthState, getCurrentUser, getCurrentProfile,
                                requireUser, requireOnboardedUser (React cache, per request)
    ai/
      provider.ts               LLMProvider interface + factory (env AI_PROVIDER; real providers in M6)
      structured.ts             generateObject: Zod validation, one repair retry, typed AIError
      errors.ts quota.ts        AIError + friendly messages; consume_ai_quota() wrapper
      providers/anthropic.ts openai.ts mock.ts
      fixtures/                 deterministic mock outputs (studio.ts)
      prompts/                  tutor.ts reviewer.ts extractor.ts studio.ts debrief.ts
      schemas/                  zod schemas for every structured output
      services/                 tutor.ts reviewer.ts gap-extractor.ts studio.ts debrief.ts
    domain/
      gaps.ts                   event → gap aggregation, severity, status transitions
      scheduling.ts             spaced repetition (SM-2 lite)
      recommendations.ts        Today plan (M3: rule-based; M8: severity × recency ranking)
      streak.ts                 practice streak + last 7 days, in the learner's time zone
      targets.ts                which saved items a conversation targets (due first, then least mastered)
      taxonomy.ts               gap category/subcategory constants
    data/today.ts               server-only reads for the Today page (parallel queries under RLS)
    data/items.ts               saved items, item detail, curated list, due items for review
    data/scenarios.ts           shared catalog + own custom scenarios (never selects system_prompt)
    scenarios.ts                scenario hrefs, category labels, catalog grouping
    items.ts                    item types, hrefs, register labels, My English URL filters
    dates.ts                    greeting / relative day formatting in the learner's time zone
    actions/                    server actions grouped by feature
    validation/                 zod input schemas
    utils/
  proxy.ts                      Next 16 proxy (formerly middleware)
supabase/
  migrations/
  seed.sql                      scenarios + curated expressions
scripts/
  verify-rls.ts                 `npm run db:verify-rls`: RLS/grant/FK checks on the real project
                                as two throwaway users (needs the service-role key; deletes them after)
  seed-demo.ts                  `npm run db:seed-demo [-- --delete]`: demo account with practice history
                                (gap aggregates match their events); rerun to refresh
tests/
  unit/  e2e/  fixtures/        (AI fixture transcripts + expected outputs)
  e2e-live/                     `npm run test:e2e:live` (playwright.live.config.ts): real Supabase project,
                                throwaway user created and deleted with the service-role key; not in CI
docs/
```

## Component architecture

- Pages are Server Components that fetch data and pass plain props to feature components.
- Interactive islands are Client Components: `ChatPanel`, `StudioSearch`, `ReviewCorrectionCard`
  (save checkbox), `GapStatusMenu`, `ReviewSession`, `OnboardingWizard`.
- `ChatPanel` uses a small `useConversation` hook: optimistic user message → POST → stream assistant
  text → reconcile with server-returned message ids. No global state library in V1.
- Shared states: `<EmptyState>`, `<ErrorState retry>`, route-level `loading.tsx` and `error.tsx`.

## Conversation state

`conversations.status`: `active → reviewing → completed`, or `reviewing → failed_review → reviewing` (retry),
or `active → abandoned`.

1. Start: server action creates the `conversations` row with a scenario snapshot, inserts
   `conversation_targets` (saved items / gaps chosen for reuse), inserts the AI's opening line, redirects to chat.
2. Turn: route handler validates input (≤ 1000 chars), checks ownership + `status = active`, enforces the turn
   cap (default 30 user turns), loads history, calls `tutor.reply` (streaming), persists both messages.
3. End: server action moves `active|failed_review → reviewing` with a conditional update (claims the review;
   if 0 rows change, another request already owns it), runs reviewer + extractor **outside** any transaction,
   validates with Zod, then calls `apply_conversation_review` once.
4. Reload-safe: state lives in the DB, not in client memory.

### Review idempotency (schema in M1, implemented in M7/M8)

Retries and double clicks must never double-count gap evidence, item usage or review progress. The plan
uses four layers:

1. **Single writer.** All review results are written by one `security definer` RPC,
   `apply_conversation_review(conversation_id, review, events)`, in one transaction. It locks the conversation
   row (`for update`), checks `user_id = auth.uid()` and `status = 'reviewing'`, and returns early (no-op) if it is
   already `completed`. A failure rolls everything back, so there are never partial rows to clean up.
2. **Natural unique keys.** `conversation_feedback (conversation_id)`, `corrections (conversation_id, position)`,
   `language_events (conversation_id, message_id, event_type, category, sub_category)`,
   `review_logs (conversation_id, item_id)`. Writes use `on conflict do nothing/update`, so replaying the same
   payload is harmless.
3. **Recompute, don't increment.** After inserting events, the RPC recomputes each touched gap from all of its
   linked events (DATABASE.md rule 2). Item "times used" is a count over `conversation_targets`; the item's SRS
   state moves only when a new `review_logs` row is actually inserted for `(conversation_id, item_id)`.
4. **Retry after a failure starts clean by construction.** A failed attempt committed nothing (layer 1). A retry
   after a successful commit is a no-op (status `completed`). `review_attempts` and `review_error` record history
   for debugging. A stale `reviewing` older than 5 minutes can be reclaimed.

## Error and loading states

- Route `loading.tsx` skeletons for every page; streamed typing indicator in chat.
- AI errors: typed `AIError` (`rate_limited`, `invalid_output`, `provider_down`, `timeout`) mapped to
  friendly messages. Structured outputs: Zod parse → one repair retry → fail.
- Review progress UI: "Reading your conversation → Finding natural alternatives → Updating your profile".
- Empty states with a clear next step (e.g. no gaps yet → "Finish a conversation to see your gaps").
- Rate limiting: per-user daily caps on AI calls via the atomic `consume_ai_quota()` RPC (DATABASE.md).

## Security

- RLS on all tables plus same-owner composite foreign keys, so a row can't be linked to another user's data
  (DATABASE.md → Design rules). Shared scenarios/curated content are read-only for users; users fully manage
  their own custom scenarios. AI-derived tables are written only by `auth.uid()`-checking RPCs.
- Keys server-only (`server-only` package); `NEXT_PUBLIC_` only for Supabase URL + anon key.
- Zod validation on all action/route inputs, length caps on free text.
- Prompt injection: user text is placed in delimited user turns, never in system prompts; outputs are
  schema-validated; the model has no tools. Custom scenario fields are length-limited and wrapped as data.
- Ownership double-check in route handlers (RLS + explicit `user_id` filter).
- No PII in logs; log conversation ids, not content.
- Per-user AI quotas; security headers via `next.config`.

## Environment variables

See `.env.example` (source of truth). Summary:

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=          # empty → unconfigured mode
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # server-only; seeding/admin scripts only, never needed by the app at runtime
AI_PROVIDER=mock                   # mock | anthropic | openai (real providers wired in M6)
AI_MODEL_CHAT=                     # set in M6 after checking the provider's current model list
AI_MODEL_ANALYSIS=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

The per-user daily AI limit lives in the database (`app_config.ai_daily_limit`), not in an env var, so the
quota RPC cannot be influenced by the caller.

## Testing strategy

- **Unit (Vitest):** domain logic (gap aggregation, severity, scheduling, recommendations), Zod schemas,
  prompt builders, input validation.
- **AI contract tests:** fixture transcripts run through services with the mock provider; schema
  conformance. Optional `npm run test:ai` hits the real provider against golden fixtures (manual).
- **Integration:** server actions against a local Supabase (`supabase start`), including RLS tests that
  user A cannot read user B's rows.
- **E2E (Playwright, mock AI):** the V1 golden path: sign up → onboarding → office hours → end →
  review → save expressions → gap appears → Today shows recommendation.
- CI (GitHub Actions): lint, typecheck, unit, build on every push.
