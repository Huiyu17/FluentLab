# FluentLab — Product

## Mission

Help intermediate-to-advanced non-native speakers sound natural and confident in real-world
English, not just grammatically correct.

Primary persona: an international student in the US who understands academic English but
struggles with spontaneous speaking, small talk, office hours, class participation, networking
and cultural pragmatics.

## Core loop

Practice → Detect Gaps → Learn → Reuse → Improve

FluentLab does not treat conversations independently. It builds a persistent learner model
from conversational evidence (language events → language gaps) and uses it to personalize
future practice.

## V1 features

| # | Feature | Purpose |
|---|---------|---------|
| 1 | Auth + onboarding | Native language, self-rated level, goal, contexts (campus/social/career…) |
| 2 | Today (dashboard) | Daily plan, streak, focus gaps, due reviews, recent activity, indicators |
| 3 | Vocabulary / Expression Studio | Deep explanation of a word/phrase + "Add to My English" |
| 4 | Real-Life Simulator | Text role-play in a scenario; AI stays in character, no live corrections |
| 5 | Conversation Review | Scores, sentence-level "what you said → more natural → why", save expressions |
| 6 | Gap Tracker | Persistent weaknesses with evidence, severity, trend, status |
| 7 | My English (saved items) | Saved words/expressions with spaced review |
| 8 | Conversation History | Past conversations + reviews |
| 9 | Real-Life Debrief | Describe a real situation → better phrasings → practice it as a scenario |
| 10 | Fluency Profile | Indicator trends over time (Recharts) |

## Key user flow (V1 definition of done)

Sign up → onboarding ("studying in the US, want to speak more naturally") → Today →
pick "Office Hours" → chat → End conversation → review → save 3 expressions →
2 gaps detected → Today updates with a recommendation for that gap →
next session: practice targeting the gap, saved expressions are reused in conversation.

## Product principles

1. Immersion first: no corrections mid-conversation.
2. Corrections live in the post-conversation review.
3. Distinguish "grammatically correct" from "natural for this context".
4. Scores are "AI-estimated learning indicators", never CEFR/official.
5. Remember recurring problems across conversations, backed by evidence counts.
6. Saved items are reused: scenarios can ask the learner to use target expressions.
7. Recommendations come from learner behavior, not a fixed course order.
8. Polished and deployable beats large and unfinished.

## Explanation style (Studio and Review)

Core meaning (in the learner's native language when helpful), native intuition, common
patterns, natural examples, common mistake (❌/✅), similar expressions, register/frequency,
and a "Try it" prompt. Tone: friendly native-speaker friend, not a dictionary.

## Explicitly NOT in V1

Voice / speech-to-text / TTS, pronunciation scoring or waveforms, phoneme analysis, listening
lab, reading/writing modules, video or avatars, multiplayer/community, teacher marketplace,
official CEFR assessment, large course catalog, mobile app, gamification (XP, leagues, badges),
payments, admin CMS, i18n of the UI (UI is English; explanations may use native language).

## Roadmap

- V2: real-time voice partner (mic → STT → LLM → TTS), hesitation/filler/pace signals, listening lab.
- V3: pronunciation, reading/writing, Practice Priority Score
  (severity × frequency × recency × (1 − mastery) × goal relevance), A/B experiment on
  contextual reuse vs flashcard-only retention.
