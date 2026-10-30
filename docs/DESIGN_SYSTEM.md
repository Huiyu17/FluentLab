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
| `--muted-foreground` | `#6E6A63` | secondary text |
| `--primary` | `#2F7D5B` soft green | primary actions, progress |
| `--primary-soft` | `#E4F1EA` | primary tints |
| `--accent-coral` | `#E5735A` | highlights, "more natural" |
| `--accent-coral-soft` | `#FBE9E4` | |
| `--accent-plum` | `#7B6A9B` muted purple | gaps / insights (sparingly) |
| `--accent-plum-soft` | `#EEEAF4` | |
| `--warning` | `#C98A2B` | medium severity |
| `--destructive` | `#C2483D` | errors, high severity |

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
- **Gap card:** title, plain-language description, severity chip, "Seen 5× in 3 conversations", example
  before → after, "Practice this" button.
- **Empty states:** friendly line + one action. Simple line illustrations or emoji, no stock art.

## Accessibility

AA contrast, visible focus ring (`--primary` 2px offset), labels on all inputs, keyboard-usable chat
(Enter sends, Shift+Enter newline), `aria-live="polite"` for streamed replies.
