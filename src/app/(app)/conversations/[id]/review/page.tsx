import { ArrowLeft, MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import {
  AnnotatedTranscript,
  ConversationPatterns,
  ReviewSummary,
  type WorthSaving,
} from "@/components/review/conversation-review";
import { ReviewRunner } from "@/components/review/review-runner";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { reviewFailure } from "@/lib/actions/conversation-review-state";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { getConversation } from "@/lib/data/conversations";
import {
  expressionKey,
  findSavedExpressions,
  getConversationPatterns,
  getConversationReview,
  type ConversationReviewView,
} from "@/lib/data/reviews";
import { speakerName, type ScenarioSnapshot } from "@/lib/domain/conversation";

export const metadata: Metadata = { title: "Conversation Review" };

/** Every saveable expression once (first occurrence), with its saved state from the server. */
async function worthSaving(userId: string, review: ConversationReviewView): Promise<WorthSaving[]> {
  const seen = new Set<string>();
  const items = review.corrections.flatMap((correction) =>
    correction.saveableExpressions.flatMap((e, index) => {
      const key = expressionKey(e.expression);
      if (!key || seen.has(key)) return [];
      seen.add(key);
      return [{ correctionId: correction.id, index, expression: e.expression, meaning: e.meaning }];
    }),
  );
  const saved = await findSavedExpressions(
    userId,
    items.map((item) => item.expression),
  );
  return items.map((item) => ({ ...item, savedItemId: saved.get(expressionKey(item.expression)) ?? null }));
}

function scenarioHref(scenario: ScenarioSnapshot | null): string | null {
  if (!scenario) return null;
  if (scenario.slug) return `/simulator/${scenario.slug}`;
  return scenario.scenarioId ? `/simulator/custom/${scenario.scenarioId}` : null;
}

async function ReviewPage({ params }: { params: PageProps<"/conversations/[id]/review">["params"] }) {
  const { id } = await params;
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<MessagesSquare className="size-5" />}
        title="Reviews need an account"
        description="Supabase is not configured, so there are no conversations to review yet."
      />
    );
  }

  const { user } = await requireOnboardedUser(`/conversations/${id}/review`);
  const conversation = await getConversation(user.id, id);
  if (!conversation) notFound();
  // Nothing to review: still in progress, or ended before the learner wrote anything.
  if (conversation.status === "active" || conversation.status === "abandoned") {
    redirect(`/conversations/${conversation.id}`);
  }

  const review =
    conversation.status === "completed" ? await getConversationReview(user.id, conversation.id) : null;
  const practiceAgain = scenarioHref(conversation.scenario);
  const [saving, patterns] = review
    ? await Promise.all([worthSaving(user.id, review), getConversationPatterns(user.id, conversation.id)])
    : [[], []];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/conversations"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Conversation History
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-primary">Conversation Review</p>
        <h1 className="font-serif text-2xl font-semibold">
          {conversation.scenario?.title ?? "Conversation"}
        </h1>
      </header>

      {conversation.status === "reviewing" && <ReviewRunner conversationId={conversation.id} />}
      {conversation.status === "failed_review" && (
        <ReviewRunner conversationId={conversation.id} failure={reviewFailure(conversation.reviewError)} />
      )}
      {conversation.status === "completed" &&
        (review ? (
          <>
            <ReviewSummary
              review={review}
              worthSaving={saving}
              sample={review.model?.startsWith("mock/") ?? false}
            />
            <ConversationPatterns patterns={patterns} />
            <AnnotatedTranscript
              messages={conversation.messages}
              corrections={review.corrections}
              speaker={conversation.scenario ? speakerName(conversation.scenario.aiRole) : "Your partner"}
            />
            <nav aria-label="Next steps" className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-sm">
              {practiceAgain && (
                <Link
                  href={practiceAgain}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Practice this scenario again
                </Link>
              )}
              <Link
                href="/my-english"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Go to My English
              </Link>
              <Link href="/today" className="font-medium text-primary underline-offset-4 hover:underline">
                Back to Today
              </Link>
            </nav>
          </>
        ) : (
          <EmptyState
            title="Review not found"
            description="This conversation is complete, but its review is missing."
          />
        ))}
    </div>
  );
}

export default function Page({ params }: PageProps<"/conversations/[id]/review">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReviewPage params={params} />
    </Suspense>
  );
}
