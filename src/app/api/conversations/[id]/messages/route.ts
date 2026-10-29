import { z } from "zod";
import { AI_ERROR_MESSAGES, AIError, type AIErrorCode } from "@/lib/ai/errors";
import { consumeAiQuota } from "@/lib/ai/quota";
import { tutorReply } from "@/lib/ai/services/tutor";
import { getAuthState, getCurrentProfile } from "@/lib/auth/dal";
import { ChatRequestSchema, encodeEvent, type ChatErrorBody, type ChatEvent } from "@/lib/chat-protocol";
import { getConversation, type ConversationMessage } from "@/lib/data/conversations";
import { MAX_MESSAGE_CHARS, MAX_USER_TURNS } from "@/lib/domain/conversation";
import { createClient } from "@/lib/supabase/server";

/**
 * One learner turn (docs/ARCHITECTURE.md → Conversation state): validate, check ownership and
 * status, enforce the turn cap, store the learner's message, then stream the tutor's reply as
 * NDJSON and store it when complete. With no `content`, retries the reply to the last message.
 */

const AI_STATUS: Record<AIErrorCode, number> = {
  invalid_input: 400,
  rate_limited: 429,
  provider_quota: 429,
  blocked: 422,
  invalid_output: 502,
  provider_down: 502,
  provider_auth: 502,
  timeout: 504,
  not_configured: 503,
};

function fail(status: number, code: string, message: string): Response {
  return Response.json({ code, message } satisfies ChatErrorBody, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function aiFailure(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof AIError) {
    return { status: AI_STATUS[error.code], code: error.code, message: AI_ERROR_MESSAGES[error.code] };
  }
  console.error("[chat] reply failed", { name: error instanceof Error ? error.name : "unknown" });
  return { status: 502, code: "provider_down", message: AI_ERROR_MESSAGES.provider_down };
}

const toSaved = (m: Pick<ConversationMessage, "id" | "role" | "content" | "seq">) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  seq: m.seq,
});

export async function POST(request: Request, ctx: RouteContext<"/api/conversations/[id]/messages">) {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") return fail(503, "unconfigured", "Conversations need Supabase.");
  if (auth.status === "signed_out") return fail(401, "signed_out", "Please sign in again.");
  const userId = auth.user.id;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail(404, "not_found", "This conversation doesn't exist.");

  let body: z.infer<typeof ChatRequestSchema>;
  try {
    const parsed = ChatRequestSchema.safeParse(await request.json());
    if (!parsed.success) return fail(400, "invalid_input", "That message couldn't be sent.");
    body = parsed.data;
  } catch {
    return fail(400, "invalid_input", "That message couldn't be sent.");
  }

  const supabase = await createClient();
  const conversation = await getConversation(userId, id);
  if (!supabase || !conversation) return fail(404, "not_found", "This conversation doesn't exist.");
  if (conversation.status !== "active") return fail(409, "not_active", "This conversation has ended.");
  if (!conversation.scenario) return fail(409, "not_active", "This conversation can't continue.");

  const history = [...conversation.messages];
  const last = history.at(-1);
  let accepted: ChatEvent | null = null;

  if (body.content !== undefined) {
    const content = body.content.trim();
    if (!content) return fail(400, "invalid_input", "Type a message first.");
    if (content.length > MAX_MESSAGE_CHARS) {
      return fail(400, "invalid_input", `Keep it under ${MAX_MESSAGE_CHARS} characters.`);
    }
    if (last?.role === "user") {
      return fail(409, "awaiting_reply", "Your last message is still waiting for a reply.");
    }
    if (history.filter((m) => m.role === "user").length >= MAX_USER_TURNS) {
      return fail(
        409,
        "turn_limit",
        "This conversation has reached its length limit. End it to get your review.",
      );
    }

    // seq is unique per conversation, so a double submit stores the message only once.
    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: id, user_id: userId, role: "user", content, seq: (last?.seq ?? -1) + 1 })
      .select("id, role, content, seq, created_at")
      .single();
    if (error?.code === "23505") return fail(409, "conflict", "That message was already sent.");
    if (error || !data) {
      console.error("[chat] store message failed", { code: error?.code });
      return fail(500, "store_failed", "Your message couldn't be saved. Please try again.");
    }
    const stored = {
      id: data.id,
      role: "user" as const,
      content: data.content,
      seq: data.seq,
      createdAt: data.created_at,
    };
    history.push(stored);
    accepted = { type: "accepted", message: toSaved(stored) };
  } else if (last?.role !== "user") {
    return fail(409, "nothing_to_answer", "There's no message waiting for a reply.");
  }

  const userTurns = history.filter((m) => m.role === "user").length;
  const profile = await getCurrentProfile();
  const reply = tutorReply(
    {
      scenario: conversation.scenario,
      learner: {
        englishLevel: profile?.englishLevel ?? null,
        nativeLanguage: profile?.nativeLanguage ?? null,
      },
      targets: conversation.targets.map((t) => ({ expression: t.expression, meaning: t.meaning })),
      history: history.map((m) => ({ role: m.role, content: m.content })),
      finalTurn: userTurns >= MAX_USER_TURNS,
    },
    { consumeQuota: () => consumeAiQuota(supabase) },
  );

  // Pull the first chunk before answering, so quota and provider errors get a real status.
  let first: IteratorResult<string>;
  try {
    first = await reply.next();
  } catch (error) {
    const failure = aiFailure(error);
    return fail(failure.status, failure.code, failure.message);
  }

  const replySeq = history.at(-1)!.seq + 1;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      // Keep generating and save the reply even if the learner leaves mid-stream.
      const send = (event: ChatEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          // Client went away.
        }
      };

      if (accepted) send(accepted);
      let text = "";
      try {
        for (let chunk = first; !chunk.done; chunk = await reply.next()) {
          text += chunk.value;
          send({ type: "delta", text: chunk.value });
        }
      } catch (error) {
        const failure = aiFailure(error);
        send({ type: "error", code: failure.code, message: failure.message });
        controller.close();
        return;
      }

      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: id,
          user_id: userId,
          role: "assistant",
          content: text.trim(),
          seq: replySeq,
        })
        .select("id, role, content, seq")
        .single();
      if (error || !data) {
        console.error("[chat] store reply failed", { code: error?.code });
        send({
          type: "error",
          code: "store_failed",
          message: "The reply couldn't be saved. Please try again.",
        });
      } else {
        send({
          type: "done",
          message: toSaved({ id: data.id, role: "assistant", content: data.content, seq: data.seq }),
          turnsLeft: Math.max(0, MAX_USER_TURNS - userTurns),
        });
      }
      try {
        controller.close();
      } catch {
        // Already closed by a disconnect.
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
