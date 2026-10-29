"use client";

import { RotateCw, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatErrorBodySchema, readEvents, type SavedMessage } from "@/lib/chat-protocol";
import { MAX_MESSAGE_CHARS } from "@/lib/domain/conversation";
import { cn } from "@/lib/utils";

type Bubble = SavedMessage & { pending?: boolean };

const SEND_FAILED = "Your message couldn't be sent. Check your connection and try again.";

// AI failures happen after the learner's message is stored, so it stays and the reply can be
// retried. Every other error means the message was not stored.
const STORED_BEFORE_FAILURE = new Set<string>([
  "rate_limited",
  "provider_quota",
  "blocked",
  "invalid_output",
  "provider_down",
  "provider_auth",
  "timeout",
  "not_configured",
]);

/**
 * Live chat with the scene partner. The database is the source of truth: the learner's message
 * is stored before the reply streams, and a failed reply can be retried (POST without content).
 */
export function ChatPanel({
  conversationId,
  initialMessages,
  speaker,
  initialTurnsLeft,
}: {
  conversationId: string;
  initialMessages: SavedMessage[];
  speaker: string;
  initialTurnsLeft: number;
}) {
  const [messages, setMessages] = useState<Bubble[]>(initialMessages);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnsLeft, setTurnsLeft] = useState(initialTurnsLeft);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const waitingForReply = !busy && messages.at(-1)?.role === "user";

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    bottomRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages.length, streaming]);

  async function send(content: string | null) {
    setBusy(true);
    setError(null);
    if (content !== null) {
      setMessages((list) => [
        ...list,
        { id: "pending", role: "user", content, seq: (list.at(-1)?.seq ?? -1) + 1, pending: true },
      ]);
      setDraft("");
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content === null ? {} : { content }),
      });

      if (!response.ok || !response.body) {
        const body = ChatErrorBodySchema.safeParse(await response.json().catch(() => null));
        // A stored message stays (the reply can be retried); an unsent one is dropped and restored.
        const stored = body.success && STORED_BEFORE_FAILURE.has(body.data.code);
        if (content !== null) {
          setMessages((list) =>
            stored
              ? list.map((m) => (m.pending ? { ...m, pending: false } : m))
              : list.filter((m) => !m.pending),
          );
          if (!stored) setDraft(content);
        }
        setError(body.success ? body.data.message : SEND_FAILED);
        return;
      }

      let reply = "";
      setStreaming("");
      for await (const event of readEvents(response.body)) {
        if (event.type === "accepted") {
          setMessages((list) => list.map((m) => (m.pending ? event.message : m)));
        } else if (event.type === "delta") {
          reply += event.text;
          setStreaming(reply);
        } else if (event.type === "done") {
          setMessages((list) => [...list, event.message]);
          setTurnsLeft(event.turnsLeft);
          setStreaming(null);
        } else {
          setError(event.message);
          setStreaming(null);
        }
      }
    } catch {
      setMessages((list) => list.map((m) => (m.pending ? { ...m, pending: false } : m)));
      setError(SEND_FAILED);
    } finally {
      setStreaming(null);
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy || waitingForReply || turnsLeft <= 0) return;
    void send(content);
  }

  // Enter sends, Shift+Enter adds a line (docs/DESIGN_SYSTEM.md → Accessibility).
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const tooLong = draft.length > MAX_MESSAGE_CHARS;

  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Conversation" className="flex flex-col gap-3">
        {messages.map((message) => (
          <li
            key={`${message.seq}-${message.id}`}
            className={cn("flex flex-col gap-1", message.role === "user" ? "items-end" : "items-start")}
          >
            <span className="px-1 text-xs text-muted-foreground">
              {message.role === "user" ? "You" : speaker}
            </span>
            <p
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 whitespace-pre-wrap sm:max-w-[75%]",
                message.role === "user" ? "rounded-br-sm bg-primary-soft" : "rounded-bl-sm border bg-card",
                message.pending && "opacity-70",
              )}
            >
              {message.content}
            </p>
          </li>
        ))}
        {streaming !== null && (
          <li className="flex flex-col items-start gap-1">
            <span className="px-1 text-xs text-muted-foreground">{speaker}</span>
            <p className="max-w-[85%] rounded-2xl rounded-bl-sm border bg-card px-4 py-2.5 whitespace-pre-wrap sm:max-w-[75%]">
              {streaming || (
                <span className="inline-flex gap-1" aria-label={`${speaker} is typing`}>
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground motion-reduce:animate-none" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms] motion-reduce:animate-none" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms] motion-reduce:animate-none" />
                </span>
              )}
            </p>
          </li>
        )}
      </ol>
      {/* Screen readers hear each finished reply once, not every streamed chunk. */}
      <p aria-live="polite" className="sr-only">
        {streaming === null && messages.at(-1)?.role === "assistant"
          ? `${speaker}: ${messages.at(-1)!.content}`
          : ""}
      </p>
      <div ref={bottomRef} />

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg bg-destructive-soft px-3 py-2.5 text-sm"
        >
          <span>{error}</span>
          {waitingForReply && (
            <Button type="button" size="sm" variant="outline" onClick={() => void send(null)}>
              <RotateCw aria-hidden />
              Try again
            </Button>
          )}
        </div>
      )}
      {!error && waitingForReply && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
          <span>{speaker} hasn&apos;t replied to your last message yet.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void send(null)}>
            <RotateCw aria-hidden />
            Get a reply
          </Button>
        </div>
      )}

      {turnsLeft > 0 ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
          <label htmlFor="chat-input" className="sr-only">
            Your message
          </label>
          <Textarea
            id="chat-input"
            ref={inputRef}
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Reply to ${speaker}…`}
            aria-invalid={tooLong ? true : undefined}
            aria-describedby="chat-hint"
            className="resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-3">
            <p
              id="chat-hint"
              className={cn("text-xs", tooLong ? "text-destructive" : "text-muted-foreground")}
            >
              {tooLong
                ? `Keep it under ${MAX_MESSAGE_CHARS} characters (${draft.length}).`
                : `Enter to send, Shift+Enter for a new line.${turnsLeft <= 5 ? ` ${turnsLeft} ${turnsLeft === 1 ? "turn" : "turns"} left.` : ""}`}
            </p>
            <Button type="submit" size="sm" disabled={busy || waitingForReply || !draft.trim() || tooLong}>
              <SendHorizontal aria-hidden />
              {busy ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="rounded-lg bg-muted px-3 py-2.5 text-sm">
          That&apos;s the end of this conversation. End it to get your review.
        </p>
      )}
    </div>
  );
}
