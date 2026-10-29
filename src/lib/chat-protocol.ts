import { z } from "zod";

/**
 * Streaming protocol for POST /api/conversations/[id]/messages: newline-delimited JSON events.
 * Errors before the stream starts come back as a JSON body `{ code, message }` with an HTTP status.
 */

const SavedMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  seq: z.number(),
});
export type SavedMessage = z.infer<typeof SavedMessageSchema>;

export const ChatEventSchema = z.discriminatedUnion("type", [
  /** The learner's message as stored (absent when retrying a reply). */
  z.object({ type: z.literal("accepted"), message: SavedMessageSchema }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  /** The tutor's reply as stored, and how many learner turns are left. */
  z.object({ type: z.literal("done"), message: SavedMessageSchema, turnsLeft: z.number() }),
  /** The reply failed part-way; nothing was stored for it, so the client can retry. */
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ChatEvent = z.infer<typeof ChatEventSchema>;

export const ChatErrorBodySchema = z.object({ code: z.string(), message: z.string() });
export type ChatErrorBody = z.infer<typeof ChatErrorBodySchema>;

/** Request body: `content` sends a new message; omitting it retries the reply to the last one. */
export const ChatRequestSchema = z.object({ content: z.string().optional() });

export function encodeEvent(event: ChatEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Reads NDJSON events from a response body as they arrive. Lines that aren't valid events are
 * skipped (a truncated final line, for example).
 */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    // stream: true keeps multi-byte characters split across chunks intact.
    buffer += decoder.decode(value, { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          const event = ChatEventSchema.safeParse(JSON.parse(line));
          if (event.success) yield event.data;
        } catch {
          // Not JSON: ignore the line.
        }
      }
      newline = buffer.indexOf("\n");
    }
    if (done) return;
  }
}
