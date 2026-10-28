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
| Same migrations on the Postgres version a Supabase project runs (15/17) | ⏳ not verified |
| RLS isolation, same-owner FKs on INSERT/UPDATE, column grants, quota RPC limit | ✅ automated on PGlite with a stubbed `auth` schema and roles |
| Seed is idempotent | ✅ automated on PGlite |
| Migrations apply on a real Supabase project (Supabase's own roles, default privileges, `auth.users`) | ⏳ **not verified**, needs a Supabase project or Docker |
| `on_auth_user_created` trigger with the real Supabase Auth signup flow | ⏳ not verified (M2) |
| RLS through PostgREST with real JWTs (supabase-js as two users) | ⏳ not verified (M2) |
| `consume_ai_quota()` under true concurrent requests | ⏳ not verified (logic is a single upsert; tested sequentially only) |

The PGlite tests check Postgres semantics only. They don't exercise Supabase itself.
Before M2 ships, run the migrations on a Supabase project and repeat the RLS checks with supabase-js.

## M2 — Auth + onboarding
- [ ] Create a Supabase project (or local Supabase with Docker) and apply migrations + seed
- [ ] Complete the pending rows in "Database verification" above
- [ ] Email/password + magic link via Supabase Auth; `/auth/callback`
- [ ] Data access layer (`getCurrentUser`), proxy redirect for signed-out users, onboarding gate
- [ ] Onboarding wizard (native language, level, goal, contexts, daily minutes)
- [ ] Settings page edits profile
- [ ] Generate `src/lib/supabase/types.ts` from the schema

## M3 — Today dashboard (static data sources wired, recommendations stubbed)

## M4 — Vocabulary / Expression Studio + My English + review session (`record_item_review` RPC)

## M5 — Scenario catalog + scenario brief + custom scenario

## M6 — AI conversation system (choose provider + verify model ids, provider abstraction, tutor, streaming chat, conversation state)

## M7 — Conversation Review (reviewer service, `apply_conversation_review` RPC, corrections, save expressions)

## M8 — Gap Tracker (extractor, deterministic aggregation, gap pages)

## M9 — Recommendations + Reuse (targets in scenarios, Today plan, Fluency Profile charts)

## M10 — Real-Life Debrief

## M11 — Testing + polish (golden-path E2E, a11y, empty/error states)

## M12 — Vercel deployment + production Supabase
