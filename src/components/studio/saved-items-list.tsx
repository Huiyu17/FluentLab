import Link from "next/link";
import type { SavedItem } from "@/lib/data/items";
import { futureDay } from "@/lib/dates";
import { ITEM_TYPE_LABELS, itemHref } from "@/lib/items";
import { cn } from "@/lib/utils";

export function reviewStatus(nextReviewAt: string, now: Date, timeZone: string): string {
  return new Date(nextReviewAt) <= now ? "Due now" : `Review ${futureDay(nextReviewAt, now, timeZone)}`;
}

/** Mastery as a small bar plus a percentage (screen readers get the number). */
export function MasteryBar({ score, className }: { score: number; className?: string }) {
  const percent = Math.round(score * 100);
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {percent}%<span className="sr-only"> mastered</span>
      </span>
    </span>
  );
}

export function SavedItemsList({
  items,
  now,
  timeZone,
  showType = false,
}: {
  items: SavedItem[];
  now: Date;
  timeZone: string;
  showType?: boolean;
}) {
  return (
    <ul className="flex flex-col divide-y rounded-2xl border bg-card">
      {items.map((item) => {
        const due = new Date(item.nextReviewAt) <= now;
        return (
          <li key={item.id}>
            <Link
              href={itemHref(item.type, item.id)}
              className="flex flex-col gap-2 px-5 py-4 transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:flex-row sm:items-center sm:gap-6"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">
                  {item.expression}
                  {showType && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {ITEM_TYPE_LABELS[item.type]}
                    </span>
                  )}
                </span>
                <span className="line-clamp-1 text-sm text-muted-foreground">{item.meaning}</span>
              </span>
              <span className="flex shrink-0 items-center gap-4">
                <MasteryBar score={item.masteryScore} />
                <span
                  className={cn(
                    "w-28 text-sm sm:text-right",
                    due ? "font-medium text-primary" : "text-muted-foreground",
                  )}
                >
                  {reviewStatus(item.nextReviewAt, now, timeZone)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
