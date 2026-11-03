# FluentLab — Design System

Feel: warm, calm, minimal, premium, educational. Notion × Linear × Headspace, a touch of Duolingo
friendliness. A place you'd want to spend 20 minutes a day. Not "another AI SaaS".

## Avoid

Purple/blue AI gradients, glow, sparkle icons for "AI", glassmorphism, dense dashboards, chatbot-only layouts,
gamified noise (confetti, XP bars).

## Color tokens (CSS variables, Tailwind via shadcn theme)

| Token | Value | Use |
|---|---|---|
| `--background` | `#FAF8F5` warm off-white | app background |
| `--surface` / `--card` | `#FFFFFF` | cards |
| `--muted` | `#F2EFEA` | subtle fills, sidebar |
| `--border` | `#E7E2DA` | hairlines |
| `--foreground` | `#1F1D1A` | text |
| `--muted-foreground` | `#625E57` | secondary text |
| `--primary` | `#2D7756` soft green | primary actions, progress |
| `--primary-soft` | `#E4F1EA` | primary tints |
| `--coral` | `#AC4B36` | highlights, "more natural", grammar errors |
| `--coral-soft` | `#FBE9E4` | |
| `--plum` | `#6B5A8C` muted purple | gaps / insights (sparingly) |
| `--plum-soft` | `#EEEAF4` | |
| `--warning` | `#926013` | medium severity, sample notices |
| `--warning-soft` | `#F8EEDC` | |
| `--destructive` | `#B24238` | errors, high severity |
| `--destructive-soft` | `#F8E4E1` | |

Contrast rule: every text color is ≥ 4.5:1 on white, on the background and on its own `-soft` tint (small text
in chips and notes sits on the tint). M11's axe scan found coral, destructive, warning and primary below that on
their tints (3.79–4.30); they were darkened just enough (same hues), to 4.6–4.7 on the tints and 5.4–5.6 on white.

Dark mode: deferred (V2).

## Typography

- Headings: `Fraunces` or `Newsreader` (serif, warm) for page titles only; UI + body: `Inter`.
- Scale: page title 32/40 semibold, section 20/28, body 15/24, small 13/20.
- Generous whitespace: page padding 32–48px, section gap 32px, card padding 20–24px.

## Shape & elevation

- Radius: cards 16px, inputs/buttons 12px, chips full.
- Shadows: almost none — `0 1px 2px rgb(31 29 26 / 0.04)`; rely on borders.
- Motion: 150–200ms ease-out; no bouncy animation. Respect `prefers-reduced-motion`.

## Layout

- Sidebar 248px, muted background, grouped sections (Today / Learn / Practice / Progress / You).
- Content max-width 1080px; reading surfaces (review, studio card) max 720px.
- Mobile: sidebar collapses to sheet; app is responsive but desktop-first.

## Key patterns

- **Correction card:** "What you said" (muted) → "More natural" (coral-soft background) → "Why" text, with a
  label "Grammar error" (coral) or "Grammatically correct, could sound more natural" (muted) and the category.
  Shown under the learner's message in the transcript. A message without a correction gets a quiet
  "No suggestions", never a ✓ or "correct" (the reviewer only picks the most useful ≤ 8). Expressions worth
  saving have "Add to My English" buttons in the review summary.
- **Chat:** not a generic chatbot. Scenario brief pinned at top (role, goal), messages as calm bubbles,
  AI speaker name ("Professor Lee") instead of "Assistant", clear "End conversation" button.
- **Indicators:** small ring or bar + number; always captioned "AI-estimated learning indicators".
- **Indicator trends (Fluency Profile, M9):** small multiples, one single-series line per indicator on a shared
  0–100 scale, in `--primary` (5.41:1 on white). The `--chart-1..5` tokens fail a categorical palette check
  (three read as gray, coral/green ΔE 6.2 under protan), so no chart relies on them for series identity. Hover
  tooltip per point, 2px line, 8px markers with a surface ring, a table view under the charts.
- **Gap card:** title, plain-language description, severity chip, "Seen 5× in 3 conversations", example
  before → after, "Practice this" button.
- **Empty states:** friendly line + one action. Simple line illustrations or emoji, no stock art.

## Accessibility

AA contrast, visible focus ring (`--primary` 2px offset), labels on all inputs, keyboard-usable chat
(Enter sends, Shift+Enter newline), `aria-live="polite"` for streamed replies.
