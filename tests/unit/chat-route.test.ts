import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AIError } from "@/lib/ai/errors";
import { mockProvider } from "@/lib/ai/providers/mock";
import { readEvents, type ChatEvent } from "@/lib/chat-protocol";
import type { Conversation, ConversationMessage } from "@/lib/data/conversations";

vi.mock("server-only", () => ({}));

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const ID = "5f6a7b8c-9d0e-4f1a-8b2c-3d4e5f6a7b8c";

const dal = { getAuthState: vi.fn(), getCurrentProfile: vi.fn() };
vi.mock("@/lib/auth/dal", () => ({
  getAuthState: () => dal.getAuthState(),
  getCurrentProfile: () => dal.getCurrentProfile(),
}));
const getConversation = vi.fn();
vi.mock("@/lib/data/conversations", () => ({
  getConversation: (userId: string, id: string) => getConversation(userId, id),
}));
const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { POST } = await import("@/app/api/conversations/[id]/messages/route");

function message(seq: number, role: "user" | "assistant", content = `${role} ${seq}`): ConversationMessage {
  return { id: `m${seq}`, role, content, seq, createdAt: "2026-10-29T12:00:00Z" };
}

function conversation(messages: ConversationMessage[], overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: ID,
    status: "active",
    scenario: {
      scenarioId: "s1",
      slug: "office-hours",
      isCustom: false,
      category: "campus",
      title: "Office Hours",
      description: "Stuck on homework.",
      userRole: "A student",
      aiRole: "Professor Lee",
      aiPersonality: "Friendly",
      goal: "Ask for clarification.",
      difficulty: "intermediate",
      openingLine: "Hey! Come on in.",
      estMinutes: 8,
    },
    startedAt: "2026-10-29T12:00:00Z",
    endedAt: null,
    messages,
    targets: [],
    ...overrides,
  };
}

type Insert = Record<string, unknown>;

/** Records message inserts; `onInsert` decides each result. `quota` is consume_ai_quota's answer. */
function fakeSupabase(onInsert: (row: Insert) => { error?: { code: string } } = () => ({}), quota = true) {
  const inserts: Insert[] = [];
  const rpc = vi.fn(async () => ({ data: [{ allowed: quota, calls: 1, daily_limit: 50 }], error: null }));
  const from = () => {
    let row: Insert = {};
    const builder = {
      insert(value: Insert) {
        row = value;
        inserts.push(value);
        return builder;
      },
      select: () => builder,
      single: async () => {
        const result = onInsert(row);
        if (result.error) return { data: null, error: result.error };
        return { data: { id: `new-${row.seq}`, created_at: "2026-10-29T12:01:00Z", ...row }, error: null };
      },
    };
    return builder;
  };
  return { client: { from, rpc }, inserts, rpc };
}

function post(body: unknown, id = ID) {
  const request = new Request(`http://localhost/api/conversations/${id}/messages`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ id }) });
}

async function events(response: Response): Promise<ChatEvent[]> {
  const list: ChatEvent[] = [];
  for await (const event of readEvents(response.body!)) list.push(event);
  return list;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  dal.getAuthState.mockReset().mockResolvedValue({ status: "signed_in", user: { id: USER_ID, email: null } });
  dal.getCurrentProfile
    .mockReset()
    .mockResolvedValue({ englishLevel: "advanced", nativeLanguage: "Spanish" });
  getConversation.mockReset().mockResolvedValue(conversation([message(0, "assistant", "Hey! Come on in.")]));
  createClient.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/conversations/[id]/messages", () => {
  it("stores the message, streams the reply in chunks and stores the reply", async () => {
    const fake = fakeSupabase();
    createClient.mockResolvedValue(fake.client);

    const response = await post({ content: "  Hi, I'm stuck on question 3.  " });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/x-ndjson");
    const list = await events(response);

    expect(list[0]).toEqual({
      type: "accepted",
      message: { id: "new-1", role: "user", content: "Hi, I'm stuck on question 3.", seq: 1 },
    });
    const deltas = list.filter((e) => e.type === "delta");
    expect(deltas.length).toBeGreaterThan(1);
    const text = deltas.map((e) => (e.type === "delta" ? e.text : "")).join("");
    expect(text).toBe("Oh, okay. Can you tell me a bit more about that?");
    expect(list.at(-1)).toEqual({
      type: "done",
      message: { id: "new-2", role: "assistant", content: text, seq: 2 },
      turnsLeft: 29,
    });

    expect(fake.inserts).toEqual([
      {
        conversation_id: ID,
        user_id: USER_ID,
        role: "user",
        content: "Hi, I'm stuck on question 3.",
        seq: 1,
      },
      { conversation_id: ID, user_id: USER_ID, role: "assistant", content: text, seq: 2 },
    ]);
    expect(fake.rpc).toHaveBeenCalledWith("consume_ai_quota");
    expect(getConversation).toHaveBeenCalledWith(USER_ID, ID);
  });

  it("rejects bad requests before touching the database", async () => {
    createClient.mockResolvedValue(fakeSupabase().client);
    const cases: [unknown, string, number, string][] = [
      [{ content: "   " }, ID, 400, "invalid_input"],
      [{ content: "x".repeat(1001) }, ID, 400, "invalid_input"],
      [{ content: 42 }, ID, 400, "invalid_input"],
      ["not json", ID, 400, "invalid_input"],
      [{ content: "hi" }, "not-a-uuid", 404, "not_found"],
    ];
    for (const [body, id, status, code] of cases) {
      const response = await post(body, id);
      expect(response.status, JSON.stringify(body)).toBe(status);
      expect(await response.json()).toMatchObject({ code });
    }
  });

  it("requires a session and Supabase", async () => {
    dal.getAuthState.mockResolvedValue({ status: "signed_out" });
    expect((await post({ content: "hi" })).status).toBe(401);
    dal.getAuthState.mockResolvedValue({ status: "unconfigured" });
    expect((await post({ content: "hi" })).status).toBe(503);
  });

  it("refuses someone else's, missing or ended conversations", async () => {
    createClient.mockResolvedValue(fakeSupabase().client);
    getConversation.mockResolvedValue(null);
    expect((await post({ content: "hi" })).status).toBe(404);

    getConversation.mockResolvedValue(conversation([message(0, "assistant")], { status: "reviewing" }));
    const ended = await post({ content: "hi" });
    expect(ended.status).toBe(409);
    expect(await ended.json()).toMatchObject({ code: "not_active" });
  });

  it("enforces the turn limit", async () => {
    const fake = fakeSupabase();
    createClient.mockResolvedValue(fake.client);
    const history = [message(0, "assistant")];
    for (let i = 0; i < 30; i++) history.push(message(2 * i + 1, "user"), message(2 * i + 2, "assistant"));
    getConversation.mockResolvedValue(conversation(history));

    const response = await post({ content: "one more" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "turn_limit" });
    expect(fake.inserts).toEqual([]);
  });

  it("reports the last allowed turn as turnsLeft 0", async () => {
    createClient.mockResolvedValue(fakeSupabase().client);
    const history = [message(0, "assistant")];
    for (let i = 0; i < 29; i++) history.push(message(2 * i + 1, "user"), message(2 * i + 2, "assistant"));
    getConversation.mockResolvedValue(conversation(history));
    expect((await events(await post({ content: "last one" }))).at(-1)).toMatchObject({
      type: "done",
      turnsLeft: 0,
    });
  });

  it("stores a double submit only once (unique seq)", async () => {
    createClient.mockResolvedValue(fakeSupabase(() => ({ error: { code: "23505" } })).client);
    const response = await post({ content: "hi" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "conflict" });
  });

  it("returns a quota error with a real status, keeps the message and lets the reply be retried", async () => {
    const limited = fakeSupabase(() => ({}), false);
    createClient.mockResolvedValue(limited.client);
    const response = await post({ content: "hi" });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      code: "rate_limited",
      message: "You've reached today's limit for AI requests. It resets tomorrow (UTC).",
    });
    expect(limited.inserts).toHaveLength(1); // the learner's message is kept

    // Later: retry the reply to that waiting message (no content).
    getConversation.mockResolvedValue(conversation([message(0, "assistant"), message(1, "user", "hi")]));
    const retry = fakeSupabase();
    createClient.mockResolvedValue(retry.client);
    const list = await events(await post({}));
    expect(list.some((e) => e.type === "accepted")).toBe(false);
    expect(list.at(-1)).toMatchObject({ type: "done", message: { role: "assistant", seq: 2 } });
    expect(retry.inserts).toEqual([expect.objectContaining({ role: "assistant", seq: 2 })]);
  });

  it("asks for a retry instead of a new message while one is waiting, and vice versa", async () => {
    createClient.mockResolvedValue(fakeSupabase().client);
    getConversation.mockResolvedValue(conversation([message(0, "assistant"), message(1, "user")]));
    const waiting = await post({ content: "another" });
    expect(waiting.status).toBe(409);
    expect(await waiting.json()).toMatchObject({ code: "awaiting_reply" });

    getConversation.mockResolvedValue(conversation([message(0, "assistant")]));
    const nothing = await post({});
    expect(nothing.status).toBe(409);
    expect(await nothing.json()).toMatchObject({ code: "nothing_to_answer" });
  });

  it("maps provider errors before the stream to clear statuses", async () => {
    createClient.mockResolvedValue(fakeSupabase().client);
    vi.spyOn(mockProvider, "streamText").mockImplementation(async function* () {
      throw new AIError("provider_quota");
    });
    const response = await post({ content: "hi" });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      code: "provider_quota",
      message: expect.stringMatching(/free AI quota/),
    });
  });

  it("reports a failure part-way through and stores no reply", async () => {
    const fake = fakeSupabase();
    createClient.mockResolvedValue(fake.client);
    vi.spyOn(mockProvider, "streamText").mockImplementation(async function* () {
      yield "Well, ";
      throw new AIError("timeout");
    });
    const list = await events(await post({ content: "hi" }));
    expect(list.map((e) => e.type)).toEqual(["accepted", "delta", "error"]);
    expect(list.at(-1)).toMatchObject({ type: "error", code: "timeout" });
    expect(fake.inserts.filter((row) => row.role === "assistant")).toEqual([]);
  });

  it("still stores the reply when the learner leaves mid-stream", async () => {
    const fake = fakeSupabase();
    createClient.mockResolvedValue(fake.client);
    const response = await post({ content: "hi" });
    await response.body!.cancel();
    await vi.waitFor(() => expect(fake.inserts.filter((row) => row.role === "assistant")).toHaveLength(1));
  });
});
