import "server-only";

import { z } from "zod";
import { AIError } from "./errors";
import type { LLMProvider, TextRequest } from "./provider";

export const DEFAULT_TIMEOUT_MS = 30_000;

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

async function callProvider(provider: LLMProvider, req: Parameters<LLMProvider["generateJson"]>[0]) {
  try {
    return await provider.generateJson(req);
  } catch (error) {
    if (error instanceof AIError) throw error;
    if (isAbort(error)) throw new AIError("timeout", undefined, { cause: error });
    throw new AIError("provider_down", undefined, { cause: error });
  }
}

/**
 * Structured output with the project's guarantee (docs/AI_SYSTEM.md): the result is
 * Zod-validated; invalid output gets one repair retry that includes the validation error;
 * a second failure is an `invalid_output` AIError. Never returns unvalidated data.
 */
export async function generateObject<T>(
  provider: LLMProvider,
  req: TextRequest & { name: string; schema: z.ZodType<T>; timeoutMs?: number },
): Promise<T> {
  const { schema, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = req;
  const signal = rest.signal ?? AbortSignal.timeout(timeoutMs);
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;

  const first = await callProvider(provider, { ...rest, signal, jsonSchema });
  const parsed = schema.safeParse(first);
  if (parsed.success) return parsed.data;

  const repaired = await callProvider(provider, {
    ...rest,
    signal,
    jsonSchema,
    messages: [
      ...rest.messages,
      { role: "assistant", content: JSON.stringify(first) },
      {
        role: "user",
        content: `That output did not match the required schema:\n${z.prettifyError(parsed.error)}\nReturn the corrected object only.`,
      },
    ],
  });
  const retried = schema.safeParse(repaired);
  if (retried.success) return retried.data;

  // Log the shape problem only, never the content.
  console.error(`[ai] ${req.name} output invalid after retry`, {
    issues: retried.error.issues.map((issue) => issue.path.join(".")),
  });
  throw new AIError("invalid_output");
}
