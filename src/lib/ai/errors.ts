/** Typed AI failures. Callers show `AI_ERROR_MESSAGES[code]`, never the underlying error. */
export const AI_ERROR_CODES = [
  "invalid_input",
  "rate_limited",
  "provider_quota",
  "blocked",
  "invalid_output",
  "provider_down",
  "provider_auth",
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
  // FluentLab's own per-user daily cap (consume_ai_quota).
  rate_limited: "You've reached today's limit for AI requests. It resets tomorrow (UTC).",
  // The AI provider's quota (e.g. the Gemini free tier). Never silently switched to a paid service.
  provider_quota:
    "The free AI quota is used up for now. Wait a minute and try again; daily limits reset at midnight Pacific time.",
  blocked: "The AI couldn't respond to that. Try rephrasing it.",
  invalid_output: "The explanation didn't come out right. Please try again.",
  provider_down: "The AI service isn't responding right now. Please try again in a moment.",
  // The provider rejected our credentials (401/403). Learners can't fix that; the server log says what to check.
  provider_auth: "The AI service isn't available right now. Please try again later.",
  timeout: "That took too long. Please try again.",
  not_configured: "AI isn't set up for this app yet.",
};
