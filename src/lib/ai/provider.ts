import "server-only";

import { z } from "zod";
import { AIError } from "./errors";
import { createGeminiProvider } from "./providers/gemini";
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
  readonly name: "mock" | "gemini" | "anthropic" | "openai";
  generateText(req: TextRequest): Promise<string>;
  streamText(req: TextRequest): AsyncIterable<string>;
  generateJson(req: JsonRequest): Promise<unknown>;
}

const ProviderNameSchema = z.enum(["mock", "gemini", "anthropic", "openai"]).catch("mock");

export function configuredProviderName(): LLMProvider["name"] {
  return ProviderNameSchema.parse(process.env.AI_PROVIDER?.trim() || "mock");
}

function requiredEnv(name: string, provider: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new AIError("not_configured", `AI_PROVIDER=${provider} needs ${name}.`);
  return value;
}

/**
 * The provider chosen by AI_PROVIDER (default and fallback: mock). Model ids always come from
 * AI_MODEL_CHAT / AI_MODEL_ANALYSIS; a missing key or model id fails here with a clear error.
 */
export function getProvider(): LLMProvider {
  const name = configuredProviderName();
  if (name === "mock") return mockProvider;
  if (name === "gemini") {
    return createGeminiProvider({
      apiKey: requiredEnv("GEMINI_API_KEY", name),
      models: { chat: requiredEnv("AI_MODEL_CHAT", name), analysis: requiredEnv("AI_MODEL_ANALYSIS", name) },
    });
  }
  throw new AIError("not_configured", `AI_PROVIDER=${name} is not wired up.`);
}
