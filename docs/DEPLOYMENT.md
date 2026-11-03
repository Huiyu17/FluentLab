# FluentLab — Deployment

Current state (M12, 2026-11-03): a **Preview-only** deployment on Vercel for showing the app, connected to the
**development** Supabase project, with Gemini's free tier. Production has no environment variables yet, so it
runs in unconfigured mode (no data, mock AI) until an independent production database exists.

## Branches and environments

| Vercel environment | Git branch | Environment variables | Database |
|---|---|---|---|
| Production (`fluent-lab-ten.vercel.app`) | `main` | none yet | none (unconfigured mode) |
| Preview | `preview` (and any other branch) | Preview-scoped, see below | development Supabase project |

- `main` stays the production branch, so going live later needs no Vercel setting changes.
- Update the preview with `git push origin main:preview`. Pushes to `main` don't change what visitors see.
- A Vercel project's first deployment is always Production and uses Production variables. Pushing a new commit to
  `preview` is what creates a Preview deployment (a branch pushed before the project was connected to GitHub has
  no deployment until its next commit).

## Preview environment variables

Vercel → project → **Settings → Environments → Preview → Environment Variables** (scope: Preview only).

| Key | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | development project URL | public by design |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | development project anon key | public by design, protected by RLS |
| `AI_PROVIDER` | `gemini` | `mock` for no AI calls |
| `AI_MODEL_CHAT`, `AI_MODEL_ANALYSIS` | the model id used locally | |
| `GEMINI_API_KEY` | a free-tier key, ideally from its own Google project | **Sensitive**; no billing on that project |

Never add `SUPABASE_SERVICE_ROLE_KEY` to Vercel: the app doesn't use it at runtime and it bypasses RLS.
`NEXT_PUBLIC_*` values are inlined at build time, so redeploy after changing any variable.
`NEXT_PUBLIC_SITE_URL` is only used in email links (sign-up confirmation, magic links), which the preview doesn't
use: sign-up is closed and test accounts sign in with a password.

## Access and accounts

- **Deployment Protection** (Settings → Deployment Protection): Hobby protects previews with Vercel Authentication
  by default. Turn it off to make previews public (they're still `noindex`), or keep it and share one deployment
  with **Share → Anyone with the link** (Hobby: one shareable link per account).
- **Sign-up closed**: Supabase → Authentication → Sign In / Providers → "Allow new users to sign up" off. Existing
  accounts still sign in; the test scripts create users through the admin API and aren't affected.
- **Test accounts**: Supabase → Authentication → Users → Add user → Create new user, "Auto Confirm User".
- While the preview shares the development database, don't run scripts that create or delete users there
  (`db:seed-demo`, `test:e2e:live`, `db:verify-rls`, `db:verify-quota`) without deciding to.

## Limits

- Hobby functions run up to 300 s, enough for a review (90 s AI budget). Functions default to `iad1`; set
  Settings → Functions → Function Region close to the Supabase project's region.
- Gemini free tier: 5 requests a minute and 20 a day per model and Google project. Visitors' practice uses it.
  Free-tier content may be used by Google: test accounts only, no real personal details.

## Going live later (not done yet)

1. A separate Supabase project for production: apply `supabase/migrations/*` in order and `supabase/seed.sql`.
2. Production-scoped variables in Vercel (same keys, production values) and `NEXT_PUBLIC_SITE_URL`.
3. Custom SMTP for Supabase Auth, the email templates switched to `token_hash` links, and the production URL in
   Supabase → Authentication → URL Configuration → Redirect URLs.
4. A smoke test against the production URL, then open sign-up.
