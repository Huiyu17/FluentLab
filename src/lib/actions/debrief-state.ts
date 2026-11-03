import { AI_ERROR_MESSAGES, type AIErrorCode } from "@/lib/ai/errors";

export type CreateDebriefState =
  | { status: "idle" }
  | {
      status: "error";
      /** Form-level message (AI or save failure). */
      message?: string;
      fieldErrors?: { situation?: string; whatYouSaid?: string };
    };

export const IDLE_DEBRIEF_STATE: CreateDebriefState = { status: "idle" };

// Debrief wording where the shared AI messages talk about Studio explanations.
const DEBRIEF_MESSAGES: Partial<Record<AIErrorCode, string>> = {
  invalid_input: "That doesn't look like a situation we can debrief. Try describing what happened.",
  invalid_output: "The debrief didn't come out right. Please try again.",
};

export function debriefFailure(code: AIErrorCode): string {
  return DEBRIEF_MESSAGES[code] ?? AI_ERROR_MESSAGES[code];
}

export type PracticeDebriefState = { status: "idle" } | { status: "error"; message: string };

export const IDLE_PRACTICE_STATE: PracticeDebriefState = { status: "idle" };
