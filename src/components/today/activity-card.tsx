import { MessagesSquare, NotebookPen } from "lucide-react";
import Link from "next/link";
import type { ActivityItem } from "@/lib/data/today";
import { pastDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { CardEmpty, DashboardCard } from "./dashboard-card";

const CONVERSATION_STATUS: Record<Extract<ActivityItem, { kind: "conversation" }>["status"], string> = {
  active: "In progress",
  reviewing: "Review in progress",
  completed: "Reviewed",
  failed_review: "Review didn't finish",
  abandoned: "Ended early",
};

function details(item: ActivityItem): string {
  if (item.kind === "debrief") return "Debrief";
  const parts = [CONVERSATION_STATUS[item.status]];
  if (item.score !== null) parts.push(`Score ${item.score}`);
  return parts.join(" · ");
}

export function ActivityCard({
  items,
  now,
  timeZone,
  className,
}: {
  items: ActivityItem[];
  now: Date;
  timeZone: string;
  className?: string;
}) {
  return (
    <DashboardCard id="activity" title="Recent activity" className={className}>
      {items.length === 0 ? (
        <CardEmpty
          title="Nothing here yet"
          description="Your conversations and debriefs will show up here, so you can pick up where you left off."
        />
      ) : (
        <ul className="-my-2 flex flex-col divide-y">
          {items.map((item) => {
            const Icon = item.kind === "conversation" ? MessagesSquare : NotebookPen;
            return (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={item.href}
                  className={cn(
                    "-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors duration-150 hover:bg-accent",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{item.title}</span>
                    <span className="text-sm text-muted-foreground">{details(item)}</span>
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {pastDay(item.at, now, timeZone)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
