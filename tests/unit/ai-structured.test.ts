import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AIError } from "@/lib/ai/errors";
import type { JsonRequest, LLMProvider } from "@/lib/ai/provider";

vi.mock("server-only", () => ({}));
const { generateObject } = await import("@/lib/ai/structured");

const Schema = z.object({ word: z.string().min(1), count: z.number().int() });

function fakeProvider(...outputs: (unknown | Error)[]) {
  const calls: JsonRequest[] = [];
  const provider: LLMProvider = {
    name: "anthropic",
    generateText: vi.fn(),
    streamText: vi.fn(),
    async generateJson(req) {
      calls.push(req);
      const next = outputs.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { provider, calls };
}

const REQUEST = {
  task: "analysis" as const,
  name: "test_object",
  schema: Schema,
  system: "Return a word.",
  messages: [{ role: "user" as const, content: "<expression>hello</expression>" }],
};

async function aiErrorCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AIError) return error.code;
    throw error;
  }
  throw new Error("Expected an AIError");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("generateObject", () => {
  it("returns valid output and sends the JSON schema", async () => {
    const { provider, calls } = fakeProvider({ word: "hello", count: 1 });
    expect(await generateObject(provider, REQUEST)).toEqual({ word: "hello", count: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: "test_object", task: "analysis", system: "Return a word." });
    expect(calls[0]?.jsonSchema).toMatchObject({ type: "object", required: ["word", "count"] });
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries once with the validation error, then succeeds", async () => {
    const { provider, calls } = fakeProvider({ word: "", count: 1.5 }, { word: "hello", count: 2 });
    expect(await generateObject(provider, REQUEST)).toEqual({ word: "hello", count: 2 });
    expect(calls).toHaveLength(2);
    const repair = calls[1]!.messages;
    expect(repair[0]).toEqual(REQUEST.messages[0]);
    expect(repair[1]).toEqual({ role: "assistant", content: JSON.stringify({ word: "", count: 1.5 }) });
    expect(repair[2]?.content).toMatch(/did not match the required schema/);
    expect(repair[2]?.content).toMatch(/word/);
  });

  it("fails with invalid_output after a second invalid answer, logging only paths", async () => {
    const { provider, calls } = fakeProvider({ nope: true }, { word: "secret text", count: "x" });
    expect(await aiErrorCode(generateObject(provider, REQUEST))).toBe("invalid_output");
    expect(calls).toHaveLength(2);
    expect(console.error).toHaveBeenCalledWith("[ai] test_object output invalid after retry", {
      issues: ["count"],
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret text");
  });

  it("maps provider failures to typed errors", async () => {
    const timeout = Object.assign(new Error("aborted"), { name: "TimeoutError" });
    expect(await aiErrorCode(generateObject(fakeProvider(timeout).provider, REQUEST))).toBe("timeout");
    expect(await aiErrorCode(generateObject(fakeProvider(new Error("503")).provider, REQUEST))).toBe(
      "provider_down",
    );
    const limited = new AIError("rate_limited");
    expect(await aiErrorCode(generateObject(fakeProvider(limited).provider, REQUEST))).toBe("rate_limited");
  });
});
