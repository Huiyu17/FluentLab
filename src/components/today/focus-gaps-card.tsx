import Link from "next/link";
import { SeverityBadge } from "@/components/gaps/gap-badges";
import { Button } from "@/components/ui/button";
import type { FocusGap } from "@/lib/data/today";
import { cn } from "@/lib/utils";
import { CardEmpty, DashboardCard, linkRow, pluralize } from "./dashboard-card";

const chip = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium";

export function FocusGapsCard({
  gaps,
  openGapCount,
  className,
}: {
  gaps: FocusGap[];
  openGapCount: number;
  className?: string;
}) {
  return (
    <DashboardCard
      id="focus"
      title="Focus areas"
      description="Patterns that keep coming up in your conversations."
      action={
        gaps.length > 0 && (
          <Button asChild variant="ghost" size="sm">
            <Link href="/gaps">
              {openGapCount > gaps.length ? `View all ${openGapCount}` : "Gap Tracker"}
            </Link>
          </Button>
        )
      }
      className={className}
    >
      {gaps.length === 0 ? (
        <CardEmpty
          title="No focus areas yet"
          description="After you finish and review a conversation, anything you keep running into shows up here."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/simulator">Start a conversation</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {gaps.map((gap) => (
            <li key={gap.id}>
              <Link href={`/gaps/${gap.id}`} className={cn(linkRow, "flex flex-col gap-1.5")}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{gap.title}</span>
                  <SeverityBadge severity={gap.severity} />
                  {gap.status === "improving" && (
                    <span className={cn(chip, "bg-primary-soft text-primary")}>Improving</span>
                  )}
                </span>
                {gap.description && (
                  <span className="line-clamp-2 text-sm text-muted-foreground">{gap.description}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  Seen {gap.evidenceCount}× in {pluralize(gap.conversationsCount, "conversation")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
