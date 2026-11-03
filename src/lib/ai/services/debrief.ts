import "server-only";

import { buildDebriefRequest, DEBRIEF_PROMPT_VERSION, type DebriefLearner } from "../prompts/debrief";
import { getProvider, type LLMProvider } from "../provider";
import { DebriefResultSchema, type DebriefResult } from "../schemas/debrief";
import { generateObject } from "../structured";
import type { DebriefInput } from "@/lib/validation/debrief";

export type DebriefCoachResult = {
  result: DebriefResult;
  /** True when it came from the mock provider; the UI must say it's a sample. */
  sample: boolean;
  /** e.g. "gemini/debrief-v1", stored with the result. */
  model: string;
};

// Thinking tokens count toward the output limit (Gemini); a debrief is ~1k output tokens.
const DEBRIEF_MAX_TOKENS = 4096;
// Both attempts (first try + repair retry) share this budget.
const DEBRIEF_TIMEOUT_MS = 60_000;

/**
 * Better phrasings and a practice scenario for a real situation, in one structured call. The caller
 * validates `input` (DebriefInputSchema) and supplies the quota check, which runs only once a
 * provider is available.
 */
export async function coachDebrief(
  input: DebriefInput,
  deps: { learner: DebriefLearner; consumeQuota: () => Promise<void>; provider?: LLMProvider },
): Promise<DebriefCoachResult> {
  const provider = deps.provider ?? getProvider();
  await deps.consumeQuota();
  const { system, messages } = buildDebriefRequest(input, deps.learner);
  const result = await generateObject(provider, {
    task: "analysis",
    name: "debrief",
    schema: DebriefResultSchema,
    system,
    messages,
    maxTokens: DEBRIEF_MAX_TOKENS,
    timeoutMs: DEBRIEF_TIMEOUT_MS,
  });
  return { result, sample: provider.name === "mock", model: `${provider.name}/${DEBRIEF_PROMPT_VERSION}` };
}
