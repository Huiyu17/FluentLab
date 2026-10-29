import "server-only";

import { z } from "zod";
import { ScenarioSnapshotSchema, type ScenarioSnapshot } from "@/lib/domain/conversation";
import { createClient } from "@/lib/supabase/server";

export const CONVERSATION_STATUSES = [
  "active",
  "reviewing",
  "completed",
  "failed_review",
  "abandoned",
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  seq: number;
  createdAt: string;
};

export type ConversationTarget = { itemId: string; expression: string; meaning: string };

export type Conversation = {
  id: string;
  status: ConversationStatus;
  /** Null only for rows written before snapshots existed. */
  scenario: ScenarioSnapshot | null;
  startedAt: string;
  endedAt: string | null;
  messages: ConversationMessage[];
  targets: ConversationTarget[];
};

const StatusSchema = z.enum(CONVERSATION_STATUSES);
const RoleSchema = z.enum(["user", "assistant"]);

function fail(label: string, error: { code?: string }): never {
  console.error(`[conversations] ${label} failed`, { code: error.code });
  throw new Error(`Could not load ${label}.`);
}

/**
 * One of the learner's conversations with its messages (by seq) and target expressions, or
 * null if it doesn't exist or isn't theirs. Null too when Supabase is not configured.
 */
export async function getConversation(userId: string, id: string): Promise<Conversation | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  if (!supabase) return null;

  const [conversation, messages, targets] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, status, scenario_snapshot, started_at, ended_at")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("id, role, content, seq, created_at")
      .eq("user_id", userId)
      .eq("conversation_id", id)
      .order("seq", { ascending: true }),
    supabase
      .from("conversation_targets")
      .select("item_id, learning_items(expression, meaning)")
      .eq("user_id", userId)
      .eq("conversation_id", id)
      .not("item_id", "is", null),
  ]);
  if (conversation.error) fail("conversation", conversation.error);
  if (messages.error) fail("messages", messages.error);
  if (targets.error) fail("conversation targets", targets.error);
  if (!conversation.data) return null;

  const snapshot = ScenarioSnapshotSchema.safeParse(conversation.data.scenario_snapshot);
  return {
    id: conversation.data.id,
    status: StatusSchema.catch("active").parse(conversation.data.status),
    scenario: snapshot.success ? snapshot.data : null,
    startedAt: conversation.data.started_at,
    endedAt: conversation.data.ended_at,
    messages: (messages.data ?? []).flatMap((m) => {
      const role = RoleSchema.safeParse(m.role);
      return role.success
        ? [{ id: m.id, role: role.data, content: m.content, seq: m.seq, createdAt: m.created_at }]
        : [];
    }),
    targets: (targets.data ?? []).flatMap((t) =>
      t.item_id && t.learning_items
        ? [{ itemId: t.item_id, expression: t.learning_items.expression, meaning: t.learning_items.meaning }]
        : [],
    ),
  };
}
