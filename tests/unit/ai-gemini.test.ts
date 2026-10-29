import { ApiError, FinishReason, ThinkingLevel, type GenerateContentResponse } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AIError, AI_ERROR_MESSAGES } from "@/lib/ai/errors";

vi.mock("server-only", () => ({}));
const { createGeminiProvider } = await import("@/lib/ai/providers/gemini");
const { generateObject } = await import("@/lib/ai/structured");
const { getProvider } = await import("@/lib/ai/provider");

const MODELS = { chat: "chat-model", analysis: "analysis-model" };
const REQUEST = {
  task: "chat" as const,
  system: "Stay in character.",
  messages: [
    { role: "user" as const, content: "Hi!" },
    { role: "assistant" as const, content: "Hey, come in." },
    { role: "user" as const, content: "Can we talk about Question 3?" },
  ],
  maxTokens: 300,
};

/** Minimal stand-in for GenerateContentResponse (only what the provider reads). */
function response(
  text: string | undefined,
  extra: Partial<GenerateContentResponse> = {},
): GenerateContentResponse {
  return { text, ...extra } as GenerateContentResponse;
}

function fakeClient() {
  return { generateContent: vi.fn(), generateContentStream: vi.fn() };
}

async function* chunks(...items: GenerateContentResponse[]) {
  for (const item of items) yield item;
}

async function collect(stream: AsyncIterable<string>) {
  const parts: string[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AIError) return error.code;
    throw error;
  }
  throw new Error("Expected an AIError");
}

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Gemini provider", () => {
  it("sends the system prompt separately, maps roles and picks the model and thinking level per task", async () => {
    const client = fakeClient();
    client.generateContent.mockResolvedValue(response("Sure, which part?"));
    const provider = createGeminiProvider({ apiKey: "k", models: MODELS, client });

    expect(await provider.generateText(REQUEST)).toBe("Sure, which part?");
    const params = client.generateContent.mock.calls[0]![0];
    expect(params.model).toBe("chat-model");
    expect(params.contents).toEqual([
      { role: "user", parts: [{ text: "Hi!" }] },
      { role: "model", parts: [{ text: "Hey, come in." }] },
      { role: "user", parts: [{ text: "Can we talk about Question 3?" }] },
    ]);
    expect(params.config).toMatchObject({
      systemInstruction: "Stay in character.",
      maxOutputTokens: 300,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    });
    // A default timeout, and at most one retry, for server errors only: never for 429 (quota).
    expect(params.config.abortSignal).toBeInstanceOf(AbortSignal);
    expect(params.config.httpOptions.retryOptions).toMatchObject({ attempts: 2 });
    expect(params.config.httpOptions.retryOptions.httpStatusCodes).not.toContain(429);

    await provider.generateText({ ...REQUEST, task: "analysis" });
    expect(client.generateContent.mock.calls[1]![0]).toMatchObject({
      model: "analysis-model",
      config: { thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM } },
    });
  });

  it("streams text chunks and skips empty ones", async () => {
    const client = fakeClient();
    client.generateContentStream.mockResolvedValue(
      chunks(response("Sure, "), response(undefined), response("which part?")),
    );
    const provider = createGeminiProvider({ apiKey: "k", models: MODELS, client });
    expect(await collect(provider.streamText(REQUEST))).toEqual(["Sure, ", "which part?"]);
  });

  it("asks for JSON with the schema (without $schema) and parses it", async () => {
    const client = fakeClient();
    client.generateContent.mockResolvedValue(response('{"word":"hello"}'));
    const provider = createGeminiProvider({ apiKey: "k", models: MODELS, client });

    const result = await provider.generateJson({
      ...REQUEST,
      task: "analysis",
      name: "test",
      jsonSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" },
    });
    expect(result).toEqual({ word: "hello" });
    expect(client.generateContent.mock.calls[0]![0].config).toMatchObject({
      responseMimeType: "application/json",
      responseJsonSchema: { type: "object" },
    });
    expect(client.generateContent.mock.calls[0]![0].config.responseJsonSchema).not.toHaveProperty("$schema");
  });

  it("feeds unparseable JSON into generateObject's repair retry", async () => {
    const client = fakeClient();
    client.generateContent
      .mockResolvedValueOnce(response("not json"))
      .mockResolvedValueOnce(response('{"word":"hello"}'));
    const provider = createGeminiProvider({ apiKey: "k", models: MODELS, client });

    const result = await generateObject(provider, {
      ...REQUEST,
      task: "analysis",
      name: "test",
      schema: z.object({ word: z.string() }),
    });
    expect(result).toEqual({ word: "hello" });
    expect(client.generateContent).toHaveBeenCalledTimes(2);
  });

  it("reports the free-quota limit (429) clearly and never retries elsewhere", async () => {
    const client = fakeClient();
    client.generateContent.mockRejectedValue(new ApiError({ message: "RESOURCE_EXHAUSTED", status: 429 }));
    const provider = createGeminiProvider({ apiKey: "k", models: MODELS, client });

    expect(await code(provider.generateText(REQUEST))).toBe("provider_quota");
    expect(client.generateContent).toHaveBeenCalledOnce();
    expect(AI_ERROR_MESSAGES.provider_quota).toMatch(/free AI quota is used up/);
    expect(console.error).toHaveBeenCalledWith("[ai] gemini request failed", { status: 429 });
  });

  it("maps other failures to typed errors", async () => {
    const cases: [unknown, string][] = [
      [new ApiError({ message: "bad key", status: 403 }), "provider_auth"],
      [new ApiError({ message: "API key not valid", status: 401 }), "provider_auth"],
      [new ApiError({ message: "oops", status: 503 }), "provider_down"],
      [Object.assign(new Error("aborted"), { name: "AbortError" }), "timeout"],
      [new Error("socket hang up"), "provider_down"],
    ];
    for (const [error, expected] of cases) {
      const client = fakeClient();
      client.generateContent.mockRejectedValue(error);
      const provider = createGeminiProvider({ apiKey: "k", models: MODELS, client });
      expect(await code(provider.generateText(REQUEST)), expected).toBe(expected);
    }
  });

  it("treats safety blocks as `blocked`, in normal and streamed replies", async () => {
    const client = fakeClient();
    client.generateContent.mockResolvedValue(
      response(undefined, { promptFeedback: { blockReason: "SAFETY" } } as Partial<GenerateContentResponse>),
    );
    client.generateContentStream.mockResolvedValue(
      chunks(
        response("Well, "),
        response(undefined, {
          candidates: [{ finishReason: FinishReason.SAFETY }],
        } as Partial<GenerateContentResponse>),
      ),
    );
    const provider = createGeminiProvider({ apiKey: "k", models: MODELS, client });

    expect(await code(provider.generateText(REQUEST))).toBe("blocked");
    expect(await code(collect(provider.streamText(REQUEST)))).toBe("blocked");
  });

  it("maps a 429 raised while streaming", async () => {
    const client = fakeClient();
    client.generateContentStream.mockRejectedValue(
      new ApiError({ message: "RESOURCE_EXHAUSTED", status: 429 }),
    );
    const provider = createGeminiProvider({ apiKey: "k", models: MODELS, client });
    expect(await code(collect(provider.streamText(REQUEST)))).toBe("provider_quota");
  });
});

describe("a rejected API key", () => {
  it("logs what to check without the key, and shows learners a neutral message", async () => {
    const client = fakeClient();
    client.generateContent.mockRejectedValue(new ApiError({ message: "API key not valid", status: 401 }));
    const provider = createGeminiProvider({ apiKey: "secret-key-value", models: MODELS, client });

    expect(await code(provider.generateText(REQUEST))).toBe("provider_auth");
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("Gemini rejected the API key (401)");
    expect(logged).toContain("GEMINI_API_KEY");
    expect(logged).not.toContain("secret-key-value");
    expect(AI_ERROR_MESSAGES.provider_auth).toBe(
      "The AI service isn't available right now. Please try again later.",
    );
  });
});

describe("empty answers (thinking used up maxOutputTokens)", () => {
  it("are failures, never empty replies", async () => {
    const empty = response("", {
      candidates: [{ finishReason: FinishReason.MAX_TOKENS }],
    } as Partial<GenerateContentResponse>);
    const client = fakeClient();
    client.generateContent.mockResolvedValue(empty);
    client.generateContentStream.mockResolvedValue(chunks(response(undefined), empty));
    const provider = createGeminiProvider({ apiKey: "k", models: MODELS, client });

    expect(await code(provider.generateText(REQUEST))).toBe("invalid_output");
    expect(await code(collect(provider.streamText(REQUEST)))).toBe("invalid_output");
  });
});

describe("getProvider with AI_PROVIDER=gemini", () => {
  it("needs the key and both model ids, with a clear message", () => {
    vi.stubEnv("AI_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("AI_MODEL_CHAT", "m");
    vi.stubEnv("AI_MODEL_ANALYSIS", "m");
    expect(() => getProvider()).toThrow("AI_PROVIDER=gemini needs GEMINI_API_KEY.");

    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubEnv("AI_MODEL_ANALYSIS", "");
    expect(() => getProvider()).toThrow("AI_PROVIDER=gemini needs AI_MODEL_ANALYSIS.");

    vi.stubEnv("AI_MODEL_ANALYSIS", "m");
    expect(getProvider().name).toBe("gemini");
  });
});
