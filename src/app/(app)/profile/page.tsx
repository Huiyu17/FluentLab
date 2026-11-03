import { ArrowDownRight, ArrowRight, ArrowUpRight, ChartLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IndicatorChart } from "@/components/profile/indicator-chart";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { getFluencyProfile, type ProfilePoint } from "@/lib/data/profile";
import { indicatorTrend, type IndicatorTrend } from "@/lib/domain/indicators";
import { SCORE_DIMENSIONS, type ScoreDimension } from "@/lib/domain/taxonomy";

export const metadata: Metadata = { title: "Fluency Profile" };

const LABELS: Record<ScoreDimension, string> = {
  fluency: "Fluency",
  naturalness: "Naturalness",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  confidence: "Confidence",
};

/** Reviews needed before charts mean anything. */
const MIN_POINTS = 2;

function trendText(trend: IndicatorTrend): string {
  switch (trend.kind) {
    case "not_enough":
      return "A trend appears after 4 reviews";
    case "steady":
      return "Steady compared with earlier reviews";
    case "up":
      return `Up ${trend.change} on your last 3 reviews`;
    case "down":
      return `Down ${-trend.change} on your last 3 reviews`;
  }
}

function TrendIcon({ trend }: { trend: IndicatorTrend }) {
  const className = "size-4 shrink-0";
  if (trend.kind === "up") return <ArrowUpRight aria-hidden className={className} />;
  if (trend.kind === "down") return <ArrowDownRight aria-hidden className={className} />;
  if (trend.kind === "steady") return <ArrowRight aria-hidden className={className} />;
  return null;
}

function HistoryTable({ points, dates }: { points: ProfilePoint[]; dates: string[] }) {
  return (
    <details className="rounded-2xl border bg-card p-5">
      <summary className="cursor-pointer text-sm font-medium">Show the numbers as a table</summary>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">AI-estimated learning indicators per reviewed conversation</caption>
          <thead className="text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 pr-4 font-medium">
                Date
              </th>
              <th scope="col" className="py-2 pr-4 font-medium">
                Conversation
              </th>
              {SCORE_DIMENSIONS.map((d) => (
                <th key={d} scope="col" className="py-2 pr-4 font-medium tabular-nums">
                  {LABELS[d]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {[...points].reverse().map((point, i) => (
              <tr key={point.conversationId}>
                <td className="py-2 pr-4 whitespace-nowrap">{dates[points.length - 1 - i]}</td>
                <td className="py-2 pr-4">
                  <Link
                    href={`/conversations/${point.conversationId}/review`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {point.title}
                  </Link>
                </td>
                {SCORE_DIMENSIONS.map((d) => (
                  <td key={d} className="py-2 pr-4 tabular-nums">
                    {point.scores[d]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

async function Profile() {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<ChartLine className="size-5" />}
        title="Your profile needs an account"
        description="Supabase is not configured, so there are no reviewed conversations yet."
      />
    );
  }

  const { user, profile } = await requireOnboardedUser("/profile");
  const data = await getFluencyProfile(user.id);
  const points = data?.points ?? [];

  if (points.length < MIN_POINTS) {
    return (
      <EmptyState
        icon={<ChartLine className="size-5" />}
        title={points.length === 0 ? "No reviewed conversations yet" : "One more conversation to go"}
        description="Your indicators are charted once you have at least two reviewed conversations."
        action={
          <Button asChild>
            <Link href="/simulator">Start a conversation</Link>
          </Button>
        }
      />
    );
  }

  const format = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: profile.timezone,
  });
  const dates = points.map((p) => format.format(new Date(p.at)));
  const gaps = data!.gaps;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        AI-estimated learning indicators from your last {points.length} reviewed conversations, on a 0–100
        scale relative to a fluent speaker in the same situation. They show your direction, not an official or
        CEFR level, and a single conversation can move them a lot.
      </p>

      <ul aria-label="Indicators" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SCORE_DIMENSIONS.map((dimension) => {
          const values = points.map((p) => p.scores[dimension]);
          const trend = indicatorTrend(values);
          return (
            <li key={dimension} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 className="font-medium">{LABELS[dimension]}</h2>
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <TrendIcon trend={trend} />
                    {trendText(trend)}
                  </p>
                </div>
                <p className="text-3xl font-semibold tabular-nums">
                  <span className="sr-only">Latest: </span>
                  {values.at(-1)}
                </p>
              </div>
              <IndicatorChart
                label={LABELS[dimension]}
                points={points.map((p, index) => ({
                  index,
                  date: dates[index]!,
                  title: p.title,
                  value: p.scores[dimension],
                }))}
              />
            </li>
          );
        })}
      </ul>

      <HistoryTable points={points} dates={dates} />

      <section aria-labelledby="profile-gaps" className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
        <h2 id="profile-gaps" className="font-medium">
          Patterns you&apos;re working on
        </h2>
        <dl className="grid grid-cols-3 gap-3 text-sm">
          {(
            [
              ["Focus areas", gaps.active],
              ["Improving", gaps.improving],
              ["Resolved", gaps.resolved],
            ] as const
          ).map(([label, count]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{count}</dd>
            </div>
          ))}
        </dl>
        <Link
          href="/gaps"
          className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Open the Gap Tracker
        </Link>
      </section>
    </div>
  );
}

export default function FluencyProfilePage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Fluency Profile"
        description="How your AI-estimated learning indicators change from conversation to conversation."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Profile />
      </Suspense>
    </div>
  );
}
