import { ArrowLeft, MessagesSquare, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { EndConversationButton } from "@/components/chat/end-conversation-button";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { tutorIsSample } from "@/lib/ai/services/tutor";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { getConversation } from "@/lib/data/conversations";
import { MAX_USER_TURNS, speakerName } from "@/lib/domain/conversation";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Conversation" };

function sampleReplies(): boolean {
  try {
    return tutorIsSample();
  } catch {
    // A misconfigured provider fails on send with a clear message; not a sample.
    return false;
  }
}

async function ConversationPage({ params }: { params: PageProps<"/conversations/[id]">["params"] }) {
  const { id } = await params;
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<MessagesSquare className="size-5" />}
        title="Conversations need an account"
        description="Supabase is not configured, so there are no conversations yet."
      />
    );
  }

  const { user } = await requireOnboardedUser(`/conversations/${id}`);
  const conversation = await getConversation(user.id, id);
  if (!conversation) notFound();
  // Ended conversations live on their review page (which runs the review if needed).
  if (conversation.status !== "active" && conversation.status !== "abandoned") {
    redirect(`/conversations/${conversation.id}/review`);
  }
  const scenario = conversation.scenario;
  const speaker = scenario ? speakerName(scenario.aiRole) : "Your partner";
  const active = conversation.status === "active";
  const userTurns = conversation.messages.filter((m) => m.role === "user").length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/simulator"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Real-Life Simulator
      </Link>

      {/* Scenario brief, pinned while scrolling (docs/DESIGN_SYSTEM.md → Chat). */}
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 -mx-1 flex flex-col gap-3 rounded-2xl border bg-card/95 p-4 backdrop-blur-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-serif text-2xl font-semibold">{scenario?.title ?? "Conversation"}</h1>
            {scenario && (
              <p className="text-sm text-muted-foreground">
                You: {scenario.userRole} · Talking to: {scenario.aiRole}
              </p>
            )}
          </div>
          {active && <EndConversationButton conversationId={conversation.id} />}
        </div>
        {scenario && (
          <p className="flex items-start gap-2 text-sm">
            <Target aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="font-medium">Your goal:</span> {scenario.goal}
            </span>
          </p>
        )}
        {conversation.targets.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Try to use:</span>{" "}
            {conversation.targets.map((t) => t.expression).join(" · ")}
          </p>
        )}
      </header>

      {active && sampleReplies() && (
        <p role="note" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Sample replies: AI isn&apos;t connected, so {speaker} answers from a short script.
        </p>
      )}

      {active ? (
        <ChatPanel
          conversationId={conversation.id}
          initialMessages={conversation.messages.map(({ id: messageId, role, content, seq }) => ({
            id: messageId,
            role,
            content,
            seq,
          }))}
          speaker={speaker}
          initialTurnsLeft={Math.max(0, MAX_USER_TURNS - userTurns)}
        />
      ) : (
        <>
          <ol aria-label="Conversation" className="flex flex-col gap-3">
            {conversation.messages.map((message) => (
              <li
                key={message.id}
                className={cn("flex flex-col gap-1", message.role === "user" ? "items-end" : "items-start")}
              >
                <span className="px-1 text-xs text-muted-foreground">
                  {message.role === "user" ? "You" : speaker}
                </span>
                <p
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 whitespace-pre-wrap sm:max-w-[75%]",
                    message.role === "user"
                      ? "rounded-br-sm bg-primary-soft"
                      : "rounded-bl-sm border bg-card",
                  )}
                >
                  {message.content}
                </p>
              </li>
            ))}
          </ol>
          <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm">
            This conversation ended before you wrote anything, so there&apos;s nothing to review. Start the
            scenario again whenever you&apos;re ready.
          </p>
        </>
      )}
    </div>
  );
}

export default function Page({ params }: PageProps<"/conversations/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ConversationPage params={params} />
    </Suspense>
  );
}
