import { Sun } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shell/page-header";
import { TodayDashboard, TodaySkeleton } from "@/components/today/today-dashboard";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { getTodayData } from "@/lib/data/today";

export const metadata: Metadata = { title: "Today" };

function Unconfigured() {
  return (
    <>
      <PageHeader title="Today" description="Your plan for today and what you practiced recently." />
      <EmptyState
        icon={<Sun className="size-5" />}
        title="Your daily plan needs an account"
        description="Supabase is not configured, so there is no practice history to plan from yet."
      />
    </>
  );
}

async function Today() {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") return <Unconfigured />;

  const { user, profile } = await requireOnboardedUser("/today");
  // Request-time: the session read above already opted this out of prerendering.
  const now = new Date();
  const data = await getTodayData(user.id, profile, now);
  if (!data) return <Unconfigured />;

  return <TodayDashboard data={data} name={profile.displayName} now={now} timeZone={profile.timezone} />;
}

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <Today />
    </Suspense>
  );
}
