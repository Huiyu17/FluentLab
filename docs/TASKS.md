# FluentLab — Tasks

Work on one milestone at a time. Each milestone ends with lint, typecheck, test and build passing,
and this file updated.

## M0 — Architecture + documentation ✅
- [x] CLAUDE.md, PRODUCT, ARCHITECTURE, DATABASE, AI_SYSTEM, DESIGN_SYSTEM, TASKS

## M1 — Project shell + design system
- [ ] Scaffold Next.js (App Router, TS strict, src/, ESLint), Tailwind, shadcn/ui
- [ ] Prettier, Vitest, Playwright config; scripts: lint, typecheck, test, test:e2e, build
- [ ] Design tokens + fonts per DESIGN_SYSTEM.md
- [ ] App shell: sidebar navigation, page header, placeholder pages for every route
- [ ] Shared EmptyState / ErrorState / skeletons, loading.tsx + error.tsx
- [ ] `.env.example`; Supabase browser/server/middleware clients
- [ ] Initial migration files (schema + RLS from DATABASE.md) and seed scenarios
- [ ] GitHub Actions CI

## M2 — Auth + onboarding
- [ ] Email/password + magic link via Supabase Auth; middleware protection
- [ ] Onboarding wizard (native language, level, goal, contexts, daily minutes)
- [ ] Settings page edits profile

## M3 — Today dashboard (static data sources wired, recommendations stubbed)

## M4 — Vocabulary / Expression Studio + My English + review session

## M5 — Scenario catalog + scenario brief + custom scenario

## M6 — AI conversation system (provider abstraction, tutor, streaming chat, conversation state)

## M7 — Conversation Review (reviewer service, corrections, save expressions)

## M8 — Gap Tracker (extractor, deterministic aggregation, gap pages)

## M9 — Recommendations + Reuse (targets in scenarios, Today plan, Fluency Profile charts)

## M10 — Real-Life Debrief

## M11 — Testing + polish (golden-path E2E, RLS tests, a11y, empty/error states)

## M12 — Vercel deployment + production Supabase
