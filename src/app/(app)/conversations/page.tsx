import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { OVERALL_LABEL_TEXT } from "@/components/review/conversation-review";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { listConversations, type ConversationSummary } from "@/lib/data/conversations";
import { pastDay } from "@/lib/dates";
import {
  CONVERSATION_STATUS_LABELS,
  conversationHref,
  type ConversationStatus,
} from "@/lib/domain/conversation";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Conversation History" };

const STATUS_STYLES: Record<ConversationStatus, string> = {
  active: "bg-primary-soft text-primary",
  reviewing: "bg-warning-soft text-warning",
  completed: "bg-muted text-foreground",
  failed_review: "bg-destructive-soft text-destructive",
  abandoned: "bg-muted text-muted-foreground",
};

const CursorSchema = z.iso.datetime({ offset: true });

function details(conversation: ConversationSummary, now: Date, timeZone: string): string {
  const parts = [
    pastDay(conversation.startedAt, now, timeZone),
    `${conversation.turns} ${conversation.turns === 1 ? "turn" : "turns"}`,
  ];
  if (conversation.overallLabel) parts.push(OVERALL_LABEL_TEXT[conversation.overallLabel]);
  return parts.join(" · ");
}

async function History({ searchParams }: { searchParams: PageProps<"/conversations">["searchParams"] }) {
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

  const { user, profile } = await requireOnboardedUser("/conversations");
  const { before } = await searchParams;
  const cursor = CursorSchema.safeParse(before);
  const result = await listConversations(user.id, cursor.success ? cursor.data : undefined);
  const now = new Date();

  if (!result || result.conversations.length === 0) {
    return cursor.success ? (
      <EmptyState
        icon={<MessagesSquare className="size-5" />}
        title="No older conversations"
        action={
          <Button asChild variant="outline">
            <Link href="/conversations">Back to the latest</Link>
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<MessagesSquare className="size-5" />}
        title="No conversations yet"
        description="Practice a real-life situation in the simulator. Each conversation and its review will be listed here."
        action={
          <Button asChild>
            <Link href="/simulator">Open the simulator</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Conversations" className="flex flex-col divide-y rounded-2xl border bg-card">
        {result.conversations.map((conversation) => (
          <li key={conversation.id}>
            <Link
              href={conversationHref(conversation.id, conversation.status)}
              className={cn(
                "flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-accent sm:px-5",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              )}
            >
              <MessagesSquare aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{conversation.title}</span>
                <span className="text-sm text-muted-foreground">
                  {details(conversation, now, profile.timezone)}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  STATUS_STYLES[conversation.status],
                )}
              >
                {CONVERSATION_STATUS_LABELS[conversation.status]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {(result.nextBefore || cursor.success) && (
        <nav aria-label="More conversations" className="flex gap-4 text-sm">
          {cursor.success && (
            <Link
              href="/conversations"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Latest
            </Link>
          )}
          {result.nextBefore && (
            <Link
              href={`/conversations?before=${encodeURIComponent(result.nextBefore)}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Older conversations
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

export default function ConversationHistoryPage({ searchParams }: PageProps<"/conversations">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Conversation History"
        description="Every conversation you've had, with its review."
      />
      <Suspense fallback={<PageSkeleton />}>
        <History searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
