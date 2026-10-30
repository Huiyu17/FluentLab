import { Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GapStatusBadge, SeverityBadge } from "@/components/gaps/gap-badges";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { listGaps, type GapSummary } from "@/lib/data/gaps";
import { pastDay } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Gap Tracker" };

const GROUPS: { status: GapSummary["status"]; title: string; description: string }[] = [
  { status: "active", title: "Focus areas", description: "Patterns that keep coming up." },
  { status: "improving", title: "Improving", description: "You've been getting these right lately." },
  { status: "resolved", title: "Resolved", description: "Not seen for 30 days after improving." },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function GapList({ gaps, now, timeZone }: { gaps: GapSummary[]; now: Date; timeZone: string }) {
  return (
    <ul className="flex flex-col divide-y rounded-2xl border bg-card">
      {gaps.map((gap) => (
        <li key={gap.id}>
          <Link
            href={`/gaps/${gap.id}`}
            className={cn(
              "flex flex-col gap-1.5 px-4 py-4 transition-colors duration-150 hover:bg-accent sm:px-5",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            )}
          >
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{gap.title}</span>
              {gap.status === "active" || gap.status === "improving" ? (
                <SeverityBadge severity={gap.severity} />
              ) : (
                <GapStatusBadge status={gap.status} />
              )}
            </span>
            <span className="line-clamp-2 text-sm text-muted-foreground">{gap.description}</span>
            <span className="text-xs text-muted-foreground">
              Seen {gap.evidenceCount}× in {plural(gap.conversationsCount, "conversation")}
              {gap.lastDetectedAt && ` · last ${pastDay(gap.lastDetectedAt, now, timeZone).toLowerCase()}`}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

async function Tracker() {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<Target className="size-5" />}
        title="The Gap Tracker needs an account"
        description="Supabase is not configured, so there are no conversations to learn from yet."
      />
    );
  }

  const { user, profile } = await requireOnboardedUser("/gaps");
  const gaps = (await listGaps(user.id)) ?? [];
  const now = new Date();
  const dismissed = gaps.filter((g) => g.status === "dismissed");

  if (gaps.length === 0) {
    return (
      <EmptyState
        icon={<Target className="size-5" />}
        title="No patterns yet"
        description="Finish a conversation to see your gaps. Something you run into more than once, or clearly, shows up here with real examples."
        action={
          <Button asChild>
            <Link href="/simulator">Start a conversation</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {GROUPS.map((group) => {
        const items = gaps.filter((g) => g.status === group.status);
        if (items.length === 0) return null;
        return (
          <section
            key={group.status}
            aria-labelledby={`gaps-${group.status}`}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-0.5">
              <h2 id={`gaps-${group.status}`} className="text-lg font-semibold">
                {group.title} <span className="font-normal text-muted-foreground">({items.length})</span>
              </h2>
              <p className="text-sm text-muted-foreground">{group.description}</p>
            </div>
            <GapList gaps={items} now={now} timeZone={profile.timezone} />
          </section>
        );
      })}
      {dismissed.length > 0 && (
        <details className="group flex flex-col gap-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            Dismissed ({dismissed.length})
          </summary>
          <div className="mt-3">
            <GapList gaps={dismissed} now={now} timeZone={profile.timezone} />
          </div>
        </details>
      )}
    </div>
  );
}

export default function GapTrackerPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Gap Tracker"
        description="Patterns FluentLab has noticed across your conversations, with the evidence behind them."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Tracker />
      </Suspense>
    </div>
  );
}
