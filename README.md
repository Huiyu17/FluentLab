# FluentLab

AI-powered English immersion for intermediate-to-advanced learners who know the grammar but want to
sound natural in real life: office hours, small talk, career fairs, the coffee shop.

**Practice → Detect Gaps → Learn → Reuse → Improve**

Status: V1 features complete (M0–M10); M11 testing and polish in progress, M12 deployment next. See
[docs/TASKS.md](docs/TASKS.md).

## What it does

- **Real-Life Simulator**: role-play a situation with an AI partner who stays in character and never
  corrects you mid-conversation. Each conversation quietly practices your top weak spot.
- **Conversation Review**: after you end, every sentence you wrote is annotated in place (what you said →
  more natural → why), grammar errors kept apart from "correct but unnatural", with AI-estimated learning
  indicators and expressions worth saving.
- **Gap Tracker**: recurring patterns built from evidence across conversations, with deterministic rules
  for focus / improving / resolved (the LLM proposes evidence, code decides).
- **Today**: a daily plan ranked by severity, recency and recent practice, linking straight to a focused
  scenario.
- **Expression Studio and My English**: explanations of words and phrases, saved items with spaced
  repetition, and reuse tracked when you use them naturally in a conversation.
- **Real-Life Debrief**: describe a real conversation, get natural phrasings across registers, and turn it
  into a practice scenario in one click.
- **Fluency Profile**: indicator trends over your reviewed conversations.

Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS, Supabase (Postgres, Auth, RLS), Zod, Gemini via a
provider abstraction (mock provider for keyless use), Recharts, Vitest, Playwright.

## Run locally

Requires Node.js ≥ 22.12.

```bash
npm install
npm run dev        # http://localhost:3000
```

The app runs without any configuration. Without Supabase variables it starts in **unconfigured mode**:
every page renders and explains that sign-in and data are unavailable. AI defaults to the `mock` provider
(sample replies and reviews, clearly labelled).

To use real data and AI, copy `.env.example` to `.env.local` and fill in the Supabase values, then set
`AI_PROVIDER=gemini` with `GEMINI_API_KEY`, `AI_MODEL_CHAT` and `AI_MODEL_ANALYSIS`. Never commit
`.env.local`. Apply `supabase/migrations/*` in order and `supabase/seed.sql` (see
[docs/DATABASE.md](docs/DATABASE.md)).

### Demo account

`npm run db:seed-demo` creates (or resets) `fluentlab-demo@example.com` with six weeks of practice history and
prints its password: reviewed conversations with corrections, gaps in every status, saved items, a debrief.
It needs no AI calls. `npm run db:seed-demo -- --delete` removes it.

### Known limits

- Gemini's free tier on this project allows **5 requests a minute and 20 a day per model**. Every chat turn,
  Studio card, review and debrief is one request, so a day covers about one or two practice conversations.
  At the limit the app says so; it never switches to a paid service.
- Free-tier Gemini content may be used by Google to improve its products: don't enter real personal details.
- Supabase's built-in email sender is heavily rate-limited until custom SMTP is set up (M12).

## Checks

```bash
npm run lint
npm run typecheck
npm test               # unit + component tests, and migration/RLS/rule tests on PGlite (Postgres in WASM)
npm run test:e2e       # Playwright on a production build in unconfigured mode, incl. axe on every page (CI)
npm run build
npm run format:check
```

Against your own Supabase project (needs `.env.local` with the service-role key; not part of CI):

```bash
npm run test:e2e:live  # Playwright with throwaway users and the mock AI: the golden path and each feature
npm run db:verify-rls  # RLS, grants and RPC permissions through PostgREST as two real users
npm run db:verify-quota # the daily AI quota under 210 concurrent calls
npm run test:ai        # a few real Gemini calls (uses quota)
npm run db:types       # regenerate src/lib/supabase/types.ts from the project
```

## Docs

- [CLAUDE.md](CLAUDE.md): working rules for this repo
- [docs/PRODUCT.md](docs/PRODUCT.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [DATABASE](docs/DATABASE.md) ·
  [AI_SYSTEM](docs/AI_SYSTEM.md) · [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) · [TASKS](docs/TASKS.md)
