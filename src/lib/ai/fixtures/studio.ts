import type { StudioCard } from "../schemas/studio";
import type { StudioKind } from "@/lib/validation/studio";

/**
 * Deterministic Studio cards for the mock provider (keyless dev, tests, E2E).
 * A few hand-written cards; anything else gets a template card that says it is a sample.
 */
const CARDS: StudioCard[] = [
  {
    expression: "touch base",
    type: "phrase",
    ipa: "/tʌtʃ beɪs/",
    coreMeaning: "To briefly check in with someone, usually to share an update or make sure you're aligned.",
    nativeMeaning: null,
    nativeIntuition:
      "It sounds friendly and low-pressure. People use it at work and school when they want a quick catch-up, not a long meeting.",
    patterns: ["touch base with someone", "touch base about something", "touch base later / next week"],
    examples: [
      "Let's touch base after the lecture.",
      "I just wanted to touch base about the group project.",
      "Can we touch base on Friday before the deadline?",
    ],
    commonMistake: {
      wrong: "Let's touch the base tomorrow.",
      right: ["Let's touch base tomorrow."],
    },
    similar: [
      { expression: "check in", nuance: "Very close; slightly more about seeing how someone is doing." },
      { expression: "catch up", nuance: "Warmer and longer; often social, not just an update." },
    ],
    register: "casual_neutral",
    frequency: 4,
    tryIt: "Write a message to a classmate suggesting you touch base about an assignment.",
  },
  {
    expression: "walk someone through something",
    type: "expression",
    ipa: null,
    coreMeaning: "To explain something to someone step by step.",
    nativeMeaning: null,
    nativeIntuition:
      "Asking someone to walk you through it sounds engaged, not lost. It's the natural way to ask for a detailed explanation at office hours.",
    patterns: ["Could you walk me through…?", "walk someone through a problem / the steps / the process"],
    examples: [
      "Could you walk me through how you got this answer?",
      "She walked us through the new grading policy.",
    ],
    commonMistake: {
      wrong: "Explain me the steps.",
      right: ["Could you walk me through the steps?", "Could you explain the steps to me?"],
    },
    similar: [
      { expression: "go over", nuance: "Reviewing something together; less step-by-step." },
      { expression: "break down", nuance: "Splitting something complex into simpler parts." },
    ],
    register: "neutral",
    frequency: 5,
    tryIt: "Ask your professor to walk you through a problem you found confusing.",
  },
  {
    expression: "tentative",
    type: "word",
    ipa: "/ˈtɛntətɪv/",
    coreMeaning: "Not certain or fixed yet; provisional.",
    nativeMeaning: null,
    nativeIntuition:
      "Common for plans and schedules. Saying a plan is tentative tells people it might change, so they shouldn't rely on it yet.",
    patterns: ["a tentative plan / date / agreement", "tentatively scheduled for…"],
    examples: [
      "Our meeting time is tentative for now.",
      "We have a tentative date for the presentation: next Thursday.",
    ],
    commonMistake: null,
    similar: [
      { expression: "provisional", nuance: "More formal; common in official contexts." },
      { expression: "up in the air", nuance: "Casual; even less settled than tentative." },
    ],
    register: "neutral",
    frequency: 3,
    tryIt: "Describe a tentative plan you have for this weekend.",
  },
];

const ALIASES: Record<string, string> = {
  "could you walk me through": "walk someone through something",
  "walk me through": "walk someone through something",
  "walk someone through": "walk someone through something",
};

function normalize(expression: string): string {
  return expression
    .toLowerCase()
    .replace(/[.?!…]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function templateCard(expression: string, kind: StudioKind): StudioCard {
  const quoted = `"${expression}"`;
  return {
    expression,
    type: kind === "vocabulary" ? "word" : /\s/.test(expression) ? "phrase" : "word",
    ipa: null,
    coreMeaning: `Sample card: once AI is connected, the meaning of ${quoted} appears here.`,
    nativeMeaning: null,
    nativeIntuition:
      "This is placeholder text from the mock AI provider. A real card explains how the expression feels to a native speaker and when they use it.",
    patterns: [`… ${expression} …`],
    examples: [
      `An example sentence using ${quoted} will appear here.`,
      `A second, more casual example with ${quoted} will appear here.`,
    ],
    commonMistake: null,
    similar: [],
    register: "neutral",
    frequency: 3,
    tryIt: `Write a sentence of your own using ${quoted}.`,
  };
}

export function mockStudioCard(expression: string, kind: StudioKind): StudioCard {
  const key = normalize(expression);
  const target = ALIASES[key] ?? key;
  return structuredClone(CARDS.find((card) => card.expression === target) ?? templateCard(expression, kind));
}

/** Expressions with a hand-written card (shown as suggestions in keyless dev). */
export const MOCK_STUDIO_EXPRESSIONS = CARDS.map((card) => card.expression);
