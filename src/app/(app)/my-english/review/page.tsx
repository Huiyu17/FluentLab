import { CalendarCheck, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ReviewSession } from "@/components/review/review-session";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { listDueItems } from "@/lib/data/items";
import { futureDay } from "@/lib/dates";

export const metadata: Metadata = { title: "Review session" };

async function Review() {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<RotateCcw className="size-5" />}
        title="Reviews need an account"
        description="Supabase is not configured, so there is nothing saved to review."
      />
    );
  }

  const { user, profile } = await requireOnboardedUser("/my-english/review");
  const now = new Date();
  const due = await listDueItems(user.id, now);

  if (!due || due.items.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck className="size-5" />}
        title="Nothing to review right now"
        description={
          due?.nextDueAt
            ? `You're all caught up. Your next review is ${futureDay(due.nextDueAt, now, profile.timezone)}.`
            : "Save words and expressions from the Studio, and they'll show up here for review."
        }
        action={
          <Button asChild variant="outline">
            <Link href="/my-english">Back to My English</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {due.dueCount > due.items.length && (
        <p className="text-sm text-muted-foreground">
          {due.dueCount} items are due. This session covers the {due.items.length} that have waited longest.
        </p>
      )}
      {/* Next keeps page state across navigations; a new render key starts a fresh session per visit. */}
      <ReviewSession key={now.getTime()} items={due.items} />
    </div>
  );
}

export default function ReviewPage() {
  return (
    <>
      <PageHeader
        title="Review"
        description="Recall each one, try it in a sentence if you like, then rate how well you knew it."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Review />
      </Suspense>
    </>
  );
}
