import "server-only";

import { AIError } from "../errors";
import { buildTutorRequest, type TutorContext } from "../prompts/tutor";
import { getProvider, type LLMProvider } from "../provider";

type Deps = { consumeQuota: () => Promise<void>; provider?: LLMProvider };

// Thinking tokens count toward the output limit (Gemini), so leave room beyond a 1–3 sentence reply.
const REPLY_MAX_TOKENS = 1024;

/** True when replies come from the mock provider; the chat UI says they are samples. */
export function tutorIsSample(provider: LLMProvider = getProvider()): boolean {
  return provider.name === "mock";
}

/**
 * The tutor's opening line, for scenarios without one. Spends quota once a provider is available.
 */
export async function tutorOpening(ctx: Omit<TutorContext, "history">, deps: Deps): Promise<string> {
  const provider = deps.provider ?? getProvider();
  await deps.consumeQuota();
  const { system, messages } = buildTutorRequest({ ...ctx, history: [] });
  const text = await provider.generateText({ task: "chat", system, messages, maxTokens: REPLY_MAX_TOKENS });
  return text.trim();
}

/**
 * Streams the tutor's in-character reply to the learner's latest message. Quota is spent before
 * the first chunk; the history must end with the learner's turn.
 */
export async function* tutorReply(ctx: TutorContext, deps: Deps): AsyncGenerator<string> {
  if (ctx.history.at(-1)?.role !== "user") {
    throw new AIError("invalid_input", "The tutor replies to a learner message.");
  }
  const provider = deps.provider ?? getProvider();
  await deps.consumeQuota();
  const { system, messages } = buildTutorRequest(ctx);
  yield* provider.streamText({ task: "chat", system, messages, maxTokens: REPLY_MAX_TOKENS });
}
