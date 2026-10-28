# FluentLab

AI-powered English immersion platform for intermediate-to-advanced learners who know grammar
but struggle to communicate naturally in real life (small talk, office hours, networking).

## Product loop (every feature must serve this)

Practice → Detect Gaps → Learn → Reuse → Improve

Read before working on a milestone:
- docs/PRODUCT.md — scope, user flow, what is NOT in V1
- docs/ARCHITECTURE.md — routes, folders, data flow
- docs/DATABASE.md — schema + RLS
- docs/AI_SYSTEM.md — AI services, prompts, schemas
- docs/DESIGN_SYSTEM.md — visual rules
- docs/TASKS.md — milestones; work on ONE milestone at a time and update it when done

## Stack

Next.js (App Router) · TypeScript (strict) · Tailwind CSS · shadcn/ui · Supabase (Postgres + Auth)
· Zod · Recharts · Vitest · Playwright · Vercel. No separate Python backend in V1.

## Next.js 16 notes (see AGENTS.md)

This is Next.js 16 with `cacheComponents` enabled. APIs differ from older versions: read the relevant
guide in `node_modules/next/dist/docs/` before using a Next API. Key differences: `middleware.ts` is now
`src/proxy.ts`; request APIs (`cookies()`, `params`) are async; request reads must sit behind `<Suspense>`;
`next lint` is gone (we run `eslint` directly).

## Engineering rules

- TypeScript strict. No `any` unless justified in a comment.
- Server Components by default; `"use client"` only for interactivity.
- Mutations go through Server Actions; streaming AI replies go through Route Handlers.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` or LLM keys to the client. Server-only modules import `server-only`.
- Every user-owned table has RLS enabled with `user_id = auth.uid()` policies.
- All AI calls go through `src/lib/ai` services. UI and actions never import an LLM SDK directly.
- All structured AI output is validated with Zod before use or persistence. Invalid output → retry once → graceful error.
- Gap aggregation, scheduling and recommendations are deterministic TypeScript, not LLM calls.
- AI scores are "AI-estimated learning indicators". Never call them CEFR or official assessments.
- During simulator conversations the AI stays in character and does NOT correct the learner.
- Validate all user input with Zod at the action/route boundary (length limits included).
- Schema changes only via new files in `supabase/migrations/`; never edit an applied migration.
- User-owned rows reference parents with same-owner composite FKs `(parent_id, user_id)`; aggregates are
  recomputed from ledgers, never incremented (docs/DATABASE.md → Design rules).
- Gap/correction categories come only from `src/lib/domain/taxonomy.ts` (mirrors `gap_taxonomy` table).
- The app must run without Supabase or AI keys (unconfigured mode + `AI_PROVIDER=mock`).
- Pin exact dependency versions (`npm install --save-exact`).
- Keep scope to the current milestone. Do not build V2/V3 features (voice, pronunciation, etc.).

## UI rules

- Warm, calm, minimal, premium, educational (Notion × Linear × Headspace, a touch of Duolingo).
- No purple AI gradients, glow effects, sparkles, or heavy glassmorphism.
- Use design tokens from docs/DESIGN_SYSTEM.md; no ad-hoc hex colors in components.
- Every data view has loading, empty and error states. Accessible: labels, focus rings, contrast AA.

## Commands

```
npm run dev         # local dev
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm test            # Vitest unit tests (+ migration smoke test on PGlite)
npm run test:e2e    # Playwright
npm run build       # production build
npm run format      # Prettier
```

Supabase CLI (`supabase start`, `supabase db reset`) needs Docker and is not set up yet; see docs/TASKS.md.

Before finishing any milestone: lint, typecheck, test, build must all pass.
