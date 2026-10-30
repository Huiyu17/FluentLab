# FluentLab

AI-powered English immersion for intermediate-to-advanced learners who know the grammar but want to
sound natural in real life.

**Practice → Detect Gaps → Learn → Reuse → Improve**

Status: M1 (project shell). See [docs/TASKS.md](docs/TASKS.md).

## Run locally

Requires Node.js ≥ 22.12.

```bash
npm install
npm run dev        # http://localhost:3000
```

The app runs without any configuration. Without Supabase variables it starts in **unconfigured mode**:
every page of the shell renders and a banner explains that sign-in and data are unavailable. AI defaults to
the `mock` provider (sample replies and reviews, clearly labelled); set `AI_PROVIDER=gemini` with a key and
model ids in `.env.local` to use Gemini (see `.env.example`).

To connect Supabase later, copy `.env.example` to `.env.local` and fill in the values.

## Checks

```bash
npm run lint
npm run typecheck
npm test           # unit tests + migration/RLS tests on PGlite
npm run test:e2e   # Playwright (builds and starts the app)
npm run build
```

## Docs

- [CLAUDE.md](CLAUDE.md): working rules for this repo
- [docs/PRODUCT.md](docs/PRODUCT.md) · [ARCHITECTURE](docs/ARCHITECTURE.md) · [DATABASE](docs/DATABASE.md) ·
  [AI_SYSTEM](docs/AI_SYSTEM.md) · [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) · [TASKS](docs/TASKS.md)
