import "server-only";

import { buildStudioRequest, type StudioLearner } from "../prompts/studio";
import { getProvider, type LLMProvider } from "../provider";
import { StudioCardSchema, type StudioCard } from "../schemas/studio";
import { generateObject } from "../structured";
import type { StudioInput } from "@/lib/validation/studio";

export type StudioResult = {
  card: StudioCard;
  /** True when the card came from the mock provider; the UI must say it's a sample. */
  sample: boolean;
};

/**
 * Explains a word or expression. The caller validates `input` (StudioInputSchema) and supplies
 * the quota check, which runs only once a provider is available.
 */
export async function explainExpression(
  input: StudioInput,
  deps: { learner: StudioLearner; consumeQuota: () => Promise<void>; provider?: LLMProvider },
): Promise<StudioResult> {
  const provider = deps.provider ?? getProvider();
  await deps.consumeQuota();

  const { system, messages } = buildStudioRequest(input, deps.learner);
  const card = await generateObject(provider, {
    task: "analysis",
    name: "studio_card",
    schema: StudioCardSchema,
    system,
    messages,
    maxTokens: 1500,
  });
  return { card, sample: provider.name === "mock" };
}
