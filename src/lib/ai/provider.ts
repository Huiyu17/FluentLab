import "server-only";

import { z } from "zod";
import { AIError } from "./errors";
import { mockProvider } from "./providers/mock";

export type ChatMessage = { role: "user" | "assistant"; content: string };

/** Which model a request needs: chat = fast model, analysis = strongest model (docs/AI_SYSTEM.md). */
export type ModelTask = "chat" | "analysis";

export type TextRequest = {
  task: ModelTask;
  /** Trusted instructions only. User-provided text always goes in `messages`. */
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  signal?: AbortSignal;
};

export type JsonRequest = TextRequest & {
  /** Identifies the output type (e.g. "studio_card"); used as the tool name by real providers. */
  name: string;
  jsonSchema: Record<string, unknown>;
};

/**
 * Providers return raw JSON for structured output; validation and the repair retry live in
 * `generateObject` (./structured.ts), so every provider gets the same guarantees.
 */
export interface LLMProvider {
  readonly name: "mock" | "anthropic" | "openai";
  generateText(req: TextRequest): Promise<string>;
  streamText(req: TextRequest): AsyncIterable<string>;
  generateJson(req: JsonRequest): Promise<unknown>;
}

const ProviderNameSchema = z.enum(["mock", "anthropic", "openai"]).catch("mock");

export function configuredProviderName(): LLMProvider["name"] {
  return ProviderNameSchema.parse(process.env.AI_PROVIDER?.trim() || "mock");
}

/** The provider chosen by AI_PROVIDER (default and fallback: mock). */
export function getProvider(): LLMProvider {
  const name = configuredProviderName();
  if (name === "mock") return mockProvider;
  // Real providers, model ids and keys are chosen and verified in M6.
  throw new AIError("not_configured", `AI_PROVIDER=${name} is not wired up yet (M6).`);
}
