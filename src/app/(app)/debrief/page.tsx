import { NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DebriefForm } from "@/components/debrief/debrief-form";
import { PageHeader } from "@/components/shell/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { listDebriefs } from "@/lib/data/debriefs";
import { pastDay } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Real-Life Debrief" };

async function Debriefs() {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<NotebookPen className="size-5" />}
        title="Debriefs need an account"
        description="Supabase is not configured, so debriefs can't be saved yet."
      />
    );
  }

  const { user, profile } = await requireOnboardedUser("/debrief");
  const debriefs = (await listDebriefs(user.id)) ?? [];
  const now = new Date();

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <DebriefForm />
      <section aria-labelledby="past-debriefs" className="flex flex-col gap-3">
        <h2 id="past-debriefs" className="text-lg font-semibold">
          Your debriefs
        </h2>
        {debriefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Your debriefs will be listed here, so you can come back to the phrasings.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-2xl border bg-card">
            {debriefs.map((debrief) => (
              <li key={debrief.id}>
                <Link
                  href={`/debrief/${debrief.id}`}
                  className={cn(
                    "flex items-start justify-between gap-4 px-4 py-3.5 transition-colors duration-150 hover:bg-accent sm:px-5",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  )}
                >
                  <span className="line-clamp-2 min-w-0">{debrief.situation}</span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {pastDay(debrief.createdAt, now, profile.timezone)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function RealLifeDebriefPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Real-Life Debrief"
        description="Tell FluentLab about a real conversation and learn what you could say next time."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Debriefs />
      </Suspense>
    </div>
  );
}
