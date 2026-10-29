import "server-only";

import {
  ApiError,
  FinishReason,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
} from "@google/genai";
import { AIError } from "../errors";
import type { LLMProvider, ModelTask, TextRequest } from "../provider";

/**
 * Gemini via the official @google/genai SDK (generateContent / generateContentStream).
 * Model ids come from AI_MODEL_CHAT / AI_MODEL_ANALYSIS; nothing here switches to another
 * provider or a paid tier. A quota error (429 RESOURCE_EXHAUSTED) surfaces as `provider_quota`.
 */

/** The parts of the SDK client this provider uses (lets tests pass a fake). */
export type GeminiModels = Pick<GoogleGenAI["models"], "generateContent" | "generateContentStream">;

export type GeminiConfig = {
  apiKey: string;
  models: Record<ModelTask, string>;
  /** Test seam; defaults to the real SDK client. */
  client?: GeminiModels;
};

// Chat favours latency; analysis (Studio, reviews) favours quality.
const THINKING: Record<ModelTask, ThinkingLevel> = {
  chat: ThinkingLevel.LOW,
  analysis: ThinkingLevel.MEDIUM,
};

const BLOCKED_REASONS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
]);

function toContents(messages: TextRequest["messages"]): Content[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

/** Used when the caller passes no signal: a busy model can otherwise hold a request open indefinitely. */
export const DEFAULT_TIMEOUT_MS = { request: 30_000, stream: 60_000 } as const;

// The SDK only retries when asked. One quick retry for transient server errors (e.g. 503 "high
// demand"); never for 429, so a used-up free quota is reported at once instead of hammered.
const RETRY = { attempts: 2, initialDelay: 1, maxDelay: 2, httpStatusCodes: [500, 502, 503, 504] };

function config(
  req: TextRequest,
  kind: keyof typeof DEFAULT_TIMEOUT_MS,
  extra: GenerateContentConfig = {},
): GenerateContentConfig {
  return {
    systemInstruction: req.system,
    maxOutputTokens: req.maxTokens,
    abortSignal: req.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS[kind]),
    httpOptions: { retryOptions: RETRY },
    thinkingConfig: { thinkingLevel: THINKING[req.task] },
    ...extra,
  };
}

/** Throws `blocked` when the prompt or the answer was stopped by a safety filter. */
function checkBlocked(response: GenerateContentResponse): void {
  if (response.promptFeedback?.blockReason) {
    throw new AIError("blocked", `Prompt blocked: ${response.promptFeedback.blockReason}`);
  }
  const reason = response.candidates?.[0]?.finishReason;
  if (reason && BLOCKED_REASONS.has(reason)) throw new AIError("blocked", `Response stopped: ${reason}`);
}

/**
 * Thinking tokens count toward maxOutputTokens: if they use it all up, Gemini returns an empty
 * answer with finishReason MAX_TOKENS. Treat "nothing at all" as a failure, never as a reply.
 */
function nonEmpty(text: string, response: GenerateContentResponse): string {
  if (text.trim()) return text;
  const reason = response.candidates?.[0]?.finishReason ?? "none";
  throw new AIError("invalid_output", `Empty response (finishReason ${reason}).`);
}

/** Maps SDK failures to typed errors; logs only the status, never request content. */
export function toAIError(error: unknown): unknown {
  if (error instanceof AIError) return error;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new AIError("timeout", undefined, { cause: error });
  }
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      // Say what to check, never the key itself.
      console.error(
        `[ai] Gemini rejected the API key (${error.status}). Check GEMINI_API_KEY in .env.local: it should be an AI Studio API key.`,
      );
      return new AIError("provider_auth", "Gemini rejected the API key.", { cause: error });
    }
    console.error("[ai] gemini request failed", { status: error.status });
    if (error.status === 429) return new AIError("provider_quota", undefined, { cause: error });
    return new AIError("provider_down", undefined, { cause: error });
  }
  return new AIError("provider_down", undefined, { cause: error });
}

/** Gemini's structured output takes plain JSON Schema; drop the `$schema` marker Zod adds. */
function geminiSchema(jsonSchema: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...jsonSchema };
  delete rest.$schema;
  return rest;
}

export function createGeminiProvider({ apiKey, models, client }: GeminiConfig): LLMProvider {
  const api = client ?? new GoogleGenAI({ apiKey }).models;

  return {
    name: "gemini",

    async generateText(req) {
      try {
        const response = await api.generateContent({
          model: models[req.task],
          contents: toContents(req.messages),
          config: config(req, "request"),
        });
        checkBlocked(response);
        return nonEmpty(response.text ?? "", response);
      } catch (error) {
        throw toAIError(error);
      }
    },

    async *streamText(req) {
      let stream: AsyncGenerator<GenerateContentResponse>;
      try {
        stream = await api.generateContentStream({
          model: models[req.task],
          contents: toContents(req.messages),
          config: config(req, "stream"),
        });
      } catch (error) {
        throw toAIError(error);
      }
      try {
        let last: GenerateContentResponse | null = null;
        let produced = false;
        for await (const chunk of stream) {
          checkBlocked(chunk);
          last = chunk;
          if (chunk.text) {
            produced = true;
            yield chunk.text;
          }
        }
        if (!produced) {
          const reason = last?.candidates?.[0]?.finishReason ?? "none";
          throw new AIError("invalid_output", `Empty stream (finishReason ${reason}).`);
        }
      } catch (error) {
        throw toAIError(error);
      }
    },

    async generateJson(req) {
      try {
        const response = await api.generateContent({
          model: models[req.task],
          contents: toContents(req.messages),
          config: config(req, "request", {
            responseMimeType: "application/json",
            responseJsonSchema: geminiSchema(req.jsonSchema),
          }),
        });
        checkBlocked(response);
        const text = nonEmpty(response.text ?? "", response);
        // Unparseable text goes back as-is: generateObject's Zod check fails and triggers the repair retry.
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return text;
        }
      } catch (error) {
        throw toAIError(error);
      }
    },
  };
}
