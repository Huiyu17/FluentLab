import "server-only";

import { z } from "zod";
import { OVERALL_LABELS, type OverallLabel } from "@/lib/ai/schemas/review";
import {
  CONVERSATION_STATUSES,
  MAX_USER_TURNS,
  ScenarioSnapshotSchema,
  type ConversationStatus,
  type ScenarioSnapshot,
} from "@/lib/domain/conversation";
import { createClient } from "@/lib/supabase/server";

export { CONVERSATION_STATUSES, type ConversationStatus } from "@/lib/domain/conversation";

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
  /** Error code of the last failed review attempt (`failed_review`). */
  reviewError: string | null;
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
      .select("id, status, scenario_snapshot, started_at, ended_at, review_error")
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
    reviewError: conversation.data.review_error,
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

export type ConversationSummary = {
  id: string;
  status: ConversationStatus;
  title: string;
  startedAt: string;
  /** Learner messages. */
  turns: number;
  overallLabel: OverallLabel | null;
};

export const HISTORY_PAGE_SIZE = 20;

/**
 * One page of the learner's conversations, newest first, started before `before` (a cursor from
 * the previous page). Turn counts come from a second query, bounded by the page size × turn cap
 * so it stays under PostgREST's row limit. Null when Supabase is not configured.
 */
export async function listConversations(
  userId: string,
  before?: string,
): Promise<{ conversations: ConversationSummary[]; nextBefore: string | null } | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  let query = supabase
    .from("conversations")
    .select("id, status, scenario_snapshot, started_at, conversation_feedback(overall_label)")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(HISTORY_PAGE_SIZE + 1);
  if (before) query = query.lt("started_at", before);
  const { data, error } = await query;
  if (error) fail("conversations", error);

  const page = (data ?? []).slice(0, HISTORY_PAGE_SIZE);
  const turns = new Map<string, number>();
  if (page.length > 0) {
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("conversation_id")
      .eq("user_id", userId)
      .eq("role", "user")
      .in(
        "conversation_id",
        page.map((c) => c.id),
      )
      .limit(HISTORY_PAGE_SIZE * MAX_USER_TURNS);
    if (messagesError) fail("conversation turns", messagesError);
    for (const m of messages ?? []) turns.set(m.conversation_id, (turns.get(m.conversation_id) ?? 0) + 1);
  }

  const LabelSchema = z.enum(OVERALL_LABELS).nullable().catch(null);
  return {
    conversations: page.map((c) => {
      const snapshot = ScenarioSnapshotSchema.safeParse(c.scenario_snapshot);
      return {
        id: c.id,
        status: StatusSchema.catch("active").parse(c.status),
        title: snapshot.success ? snapshot.data.title : "Conversation",
        startedAt: c.started_at,
        turns: turns.get(c.id) ?? 0,
        overallLabel: LabelSchema.parse(c.conversation_feedback[0]?.overall_label ?? null),
      };
    }),
    nextBefore: (data ?? []).length > HISTORY_PAGE_SIZE ? (page.at(-1)?.started_at ?? null) : null,
  };
}
