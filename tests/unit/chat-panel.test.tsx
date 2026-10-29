// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/components/chat/chat-panel";
import { encodeEvent, type ChatEvent, type SavedMessage } from "@/lib/chat-protocol";
import { speakerName } from "@/lib/domain/conversation";

const OPENING: SavedMessage = { id: "m0", role: "assistant", content: "Hey! Come on in.", seq: 0 };

function streamResponse(events: ChatEvent[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(encodeEvent(event)));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ code, message }, { status });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPanel(messages: SavedMessage[] = [OPENING], turnsLeft = 30) {
  return render(
    <ChatPanel
      conversationId="c1"
      initialMessages={messages}
      speaker="Professor Lee"
      initialTurnsLeft={turnsLeft}
    />,
  );
}

async function typeAndSend(text: string) {
  fireEvent.change(screen.getByLabelText("Your message"), { target: { value: text } });
  await act(async () => {
    fireEvent.keyDown(screen.getByLabelText("Your message"), { key: "Enter" });
  });
}

describe("ChatPanel", () => {
  it("labels the partner by name and sends on Enter, streaming the reply in", async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        { type: "accepted", message: { id: "m1", role: "user", content: "I'm stuck.", seq: 1 } },
        { type: "delta", text: "Oh, " },
        { type: "delta", text: "which part?" },
        {
          type: "done",
          message: { id: "m2", role: "assistant", content: "Oh, which part?", seq: 2 },
          turnsLeft: 29,
        },
      ]),
    );
    renderPanel();
    expect(screen.getAllByText("Professor Lee")[0]).toBeInTheDocument();

    await typeAndSend("I'm stuck.");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/conversations/c1/messages",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ content: "I'm stuck." }) }),
    );
    expect(screen.getByText("I'm stuck.")).toBeInTheDocument();
    expect(screen.getAllByText("Oh, which part?").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Your message")).toHaveValue("");
  });

  it("adds a line on Shift+Enter instead of sending", async () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "Hi" } });
    fireEvent.keyDown(screen.getByLabelText("Your message"), { key: "Enter", shiftKey: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps a stored message after an AI error and lets the learner retry the reply", async () => {
    fetchMock.mockResolvedValueOnce(
      errorResponse(429, "provider_quota", "The free AI quota is used up for now."),
    );
    renderPanel();
    await typeAndSend("Can we talk?");

    expect(screen.getByRole("alert")).toHaveTextContent("The free AI quota is used up for now.");
    expect(screen.getByText("Can we talk?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    fetchMock.mockResolvedValueOnce(
      streamResponse([
        { type: "delta", text: "Sure." },
        { type: "done", message: { id: "m2", role: "assistant", content: "Sure.", seq: 2 }, turnsLeft: 29 },
      ]),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/conversations/c1/messages",
      expect.objectContaining({ body: JSON.stringify({}) }),
    );
    expect(screen.getAllByText("Sure.").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("drops a rejected message and gives the text back", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(400, "invalid_input", "Keep it under 1000 characters."));
    renderPanel();
    await typeAndSend("Too long, apparently");
    expect(screen.getByRole("alert")).toHaveTextContent("Keep it under 1000 characters.");
    expect(screen.queryByText("Too long, apparently", { selector: "p" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toHaveValue("Too long, apparently");
  });

  it("offers a reply for a message left unanswered (after a reload)", () => {
    renderPanel([OPENING, { id: "m1", role: "user", content: "Hello?", seq: 1 }]);
    expect(screen.getByText(/hasn't replied to your last message yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get a reply" })).toBeInTheDocument();
  });

  it("shows a stream that fails part-way as an error with a retry", async () => {
    fetchMock.mockResolvedValue(
      streamResponse([
        { type: "accepted", message: { id: "m1", role: "user", content: "Hi", seq: 1 } },
        { type: "delta", text: "Well, " },
        { type: "error", code: "timeout", message: "That took too long. Please try again." },
      ]),
    );
    renderPanel();
    await typeAndSend("Hi");
    expect(screen.getByRole("alert")).toHaveTextContent("That took too long.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("warns near the turn limit and closes the composer at it", () => {
    const { unmount } = renderPanel([OPENING], 3);
    expect(screen.getByText(/3 turns left/)).toBeInTheDocument();
    unmount();
    renderPanel([OPENING], 0);
    expect(screen.queryByLabelText("Your message")).not.toBeInTheDocument();
    expect(screen.getByText(/End it to get your review/)).toBeInTheDocument();
  });
});

describe("speakerName", () => {
  it("shortens role descriptions to a name", () => {
    expect(speakerName("Professor Lee, who teaches the course")).toBe("Professor Lee");
    expect(speakerName("Jordan, a friendly classmate")).toBe("Jordan");
    expect(speakerName("Sam (a confident group member)")).toBe("Sam");
    expect(speakerName("A barista")).toBe("A barista");
    expect(speakerName("my advisor who is busy")).toBe("Advisor");
    expect(speakerName("")).toBe("Your partner");
    expect(speakerName("x".repeat(60))).toHaveLength(40);
  });
});
