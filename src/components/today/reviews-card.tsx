import Link from "next/link";
import { Button } from "@/components/ui/button";
import { futureDay } from "@/lib/dates";
import { CardEmpty, DashboardCard, pluralize } from "./dashboard-card";

export function ReviewsCard({
  reviews,
  now,
  timeZone,
  className,
}: {
  reviews: { dueCount: number; totalCount: number; nextDueAt: string | null };
  now: Date;
  timeZone: string;
  className?: string;
}) {
  const { dueCount, totalCount, nextDueAt } = reviews;

  return (
    <DashboardCard id="reviews" title="Reviews" className={className}>
      {totalCount === 0 ? (
        <CardEmpty
          title="Nothing saved yet"
          description="Save words and expressions from Studio or a conversation review. They come back here when it's time to review."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/expressions">Explore expressions</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            {dueCount > 0 ? (
              <p>
                <span className="font-serif text-4xl font-semibold lining-nums">{dueCount}</span>{" "}
                <span className="text-muted-foreground">due now</span>
              </p>
            ) : (
              <p className="font-medium">All caught up</p>
            )}
            <p className="text-sm text-muted-foreground">
              {pluralize(totalCount, "item")} saved in My English.
              {dueCount === 0 && nextDueAt && ` Next review ${futureDay(nextDueAt, now, timeZone)}.`}
            </p>
          </div>
          <div>
            {dueCount > 0 ? (
              <Button asChild size="sm">
                <Link href="/my-english/review">Start review</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/my-english">Open My English</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
