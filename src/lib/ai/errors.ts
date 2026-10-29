/** Typed AI failures. Callers show `AI_ERROR_MESSAGES[code]`, never the underlying error. */
export const AI_ERROR_CODES = [
  "invalid_input",
  "rate_limited",
  "invalid_output",
  "provider_down",
  "timeout",
  "not_configured",
] as const;
export type AIErrorCode = (typeof AI_ERROR_CODES)[number];

export class AIError extends Error {
  readonly code: AIErrorCode;

  constructor(code: AIErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options);
    this.name = "AIError";
    this.code = code;
  }
}

export const AI_ERROR_MESSAGES: Record<AIErrorCode, string> = {
  invalid_input: "That doesn't look like something we can explain. Try a word or a short phrase.",
  rate_limited: "You've reached today's limit for AI requests. It resets tomorrow (UTC).",
  invalid_output: "The explanation didn't come out right. Please try again.",
  provider_down: "The AI service isn't responding right now. Please try again in a moment.",
  timeout: "That took too long. Please try again.",
  not_configured: "AI isn't set up for this app yet.",
};
