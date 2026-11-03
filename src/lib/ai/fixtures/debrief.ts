import { ENGLISH_LEVELS, type EnglishLevel } from "@/lib/validation/profile";
import { readTagged } from "../prompts/data";
import type { DebriefResult } from "../schemas/debrief";

/** Deterministic debrief for the mock provider (keyless dev, tests, E2E). Says it is a sample. */
export function mockDebrief(request: string): DebriefResult {
  const situation = readTagged(request, "situation") ?? "a real conversation";
  const level = readTagged(request, "difficulty_value");
  const difficulty: EnglishLevel = ENGLISH_LEVELS.includes(level as EnglishLevel)
    ? (level as EnglishLevel)
    : "intermediate";
  const short = situation.replace(/\s+/g, " ").slice(0, 60).trim();

  return {
    situationSummary: `Sample debrief: ${short}`,
    phrasings: [
      {
        register: "casual",
        text: "Hey, sorry, could I ask you something quickly?",
        note: "With friends or peers.",
      },
      {
        register: "neutral",
        text: "Sorry to bother you, could you help me with something?",
        note: "Works almost anywhere.",
      },
      {
        register: "formal",
        text: "Excuse me, would you mind helping me with something?",
        note: "With staff or someone you don't know.",
      },
    ],
    explanation:
      "This is a sample debrief from the mock AI provider. Connect an AI provider to get real phrasings for your situation.",
    expressions: [
      { expression: "Sorry to bother you, …", meaning: "A polite way to start asking for help." },
    ],
    scenario: {
      title: `Practice: ${short}`.slice(0, 120),
      description: situation.slice(0, 1000),
      userRole: "You, in the situation you described",
      aiRole: "The other person in that situation",
      aiPersonality: "Busy but willing to help",
      goal: "Say what you needed to say, clearly and politely.",
      difficulty,
      openingLine: "Hi, what can I do for you?",
      estMinutes: 5,
    },
  };
}
