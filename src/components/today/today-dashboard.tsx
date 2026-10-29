import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { TodayData } from "@/lib/data/today";
import { greeting, longDate } from "@/lib/dates";
import { ActivityCard } from "./activity-card";
import { FocusGapsCard } from "./focus-gaps-card";
import { IndicatorsCard } from "./indicators-card";
import { PlanCard } from "./plan-card";
import { ReviewsCard } from "./reviews-card";
import { StreakCard } from "./streak-card";

export function TodayDashboard({
  data,
  name,
  now,
  timeZone,
}: {
  data: TodayData;
  name: string | null;
  now: Date;
  timeZone: string;
}) {
  return (
    <>
      <PageHeader
        title={name ? `${greeting(now, timeZone)}, ${name}` : greeting(now, timeZone)}
        description={longDate(now, timeZone)}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <PlanCard
          plan={data.plan}
          planMinutes={data.planMinutes}
          dailyGoalMinutes={data.dailyGoalMinutes}
          className="lg:col-span-2"
        />
        <StreakCard streak={data.streak} />
        <ReviewsCard reviews={data.reviews} now={now} timeZone={timeZone} />
        <FocusGapsCard gaps={data.focusGaps} openGapCount={data.openGapCount} className="lg:col-span-2" />
        <ActivityCard items={data.recentActivity} now={now} timeZone={timeZone} className="lg:col-span-2" />
        <IndicatorsCard indicators={data.indicators} now={now} timeZone={timeZone} />
      </div>
    </>
  );
}

/** Loading state shaped like the dashboard. */
export function TodaySkeleton() {
  return (
    <div role="status" aria-label="Loading today's plan" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-72 max-w-full rounded-lg" />
        <Skeleton className="h-5 w-48 rounded-lg" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
