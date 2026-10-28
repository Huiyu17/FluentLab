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
   └─ src/lib/supabase ─── browser / server / middleware / admin clients
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

`middleware.ts` refreshes the Supabase session, redirects unauthenticated users from `(app)` to `/login`,
and redirects users without `profiles.onboarded_at` to `/onboarding`.

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
    supabase/ client.ts server.ts middleware.ts admin.ts types.ts (generated)
    ai/
      provider.ts               LLMProvider interface + factory (env AI_PROVIDER)
      providers/anthropic.ts openai.ts mock.ts
      prompts/                  tutor.ts reviewer.ts extractor.ts studio.ts debrief.ts
      schemas/                  zod schemas for every structured output
      services/                 tutor.ts reviewer.ts gap-extractor.ts studio.ts debrief.ts
    domain/
      gaps.ts                   event → gap aggregation, severity, status transitions
      scheduling.ts             spaced repetition (SM-2 lite)
      recommendations.ts        Today plan ranking
      taxonomy.ts               gap category/subcategory constants
    actions/                    server actions grouped by feature
    validation/                 zod input schemas
    utils/
  middleware.ts
supabase/
  migrations/
  seed.sql                      scenarios + curated expressions
tests/
  unit/  e2e/  fixtures/        (AI fixture transcripts + expected outputs)
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

`conversations.status`: `active → reviewing → completed` (or `abandoned`, or `failed_review`).

1. Start: server action creates `conversations` row with a snapshot of the scenario + target items
   (saved expressions/gaps chosen for reuse), inserts the AI's opening line, redirects to chat.
2. Turn: route handler validates input (≤ 1000 chars), checks ownership + `status = active`, enforces turn
   cap (default 30 user turns), loads history, calls `tutor.reply` (streaming), persists both messages.
3. End: server action sets `reviewing`, runs reviewer + gap extractor, writes feedback, corrections,
   language events, updates gaps and item usage, sets `completed`. On failure → `failed_review` with a
   "Retry review" button (idempotent: deletes partial review rows first).
4. Reload-safe: state lives in the DB, not in client memory.

## Error and loading states

- Route `loading.tsx` skeletons for every page; streamed typing indicator in chat.
- AI errors: typed `AIError` (`rate_limited`, `invalid_output`, `provider_down`, `timeout`) mapped to
  friendly messages. Structured outputs: Zod parse → one repair retry → fail.
- Review progress UI: "Reading your conversation → Finding natural alternatives → Updating your profile".
- Empty states with a clear next step (e.g. no gaps yet → "Finish a conversation to see your gaps").
- Rate limiting: per-user daily caps on AI calls stored in `ai_usage` (prevents bill shock on the demo).

## Security

- RLS on all user tables; scenarios/curated content readable by authenticated users, writable only via
  migrations/seed.
- Keys server-only (`server-only` package); `NEXT_PUBLIC_` only for Supabase URL + anon key.
- Zod validation on all action/route inputs, length caps on free text.
- Prompt injection: user text is placed in delimited user turns, never in system prompts; outputs are
  schema-validated; the model has no tools. Custom scenario fields are length-limited and wrapped as data.
- Ownership double-check in route handlers (RLS + explicit `user_id` filter).
- No PII in logs; log conversation ids, not content.
- Per-user AI quotas; security headers via `next.config`.

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # seeding only, server-only
AI_PROVIDER=anthropic             # anthropic | openai | mock
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL_CHAT=claude-sonnet-5-5
ANTHROPIC_MODEL_ANALYSIS=claude-opus-5-5
OPENAI_API_KEY=                   # optional
AI_DAILY_LIMIT=200                # AI calls per user per day
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

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
