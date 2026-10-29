import { MessagesSquare, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shell/page-header";
import { ScenarioGrid } from "@/components/simulator/scenario-card";
import { Button } from "@/components/ui/button";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { listScenarios } from "@/lib/data/scenarios";
import { SCENARIO_CATEGORY_LABELS, groupScenarios } from "@/lib/scenarios";

export const metadata: Metadata = { title: "Real-Life Simulator" };

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={id} className="text-xl font-semibold">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

async function Catalog() {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<MessagesSquare className="size-5" />}
        title="Scenarios need an account"
        description="Supabase is not configured, so the scenario catalog can't be loaded yet."
      />
    );
  }

  const { user, profile } = await requireOnboardedUser("/simulator");
  const scenarios = await listScenarios(user.id);
  if (!scenarios) return null;
  const { recommended, groups } = groupScenarios(scenarios.shared, profile.contexts);
  const contextNames = profile.contexts.map((c) => SCENARIO_CATEGORY_LABELS[c]).join(", ");

  return (
    <div className="flex flex-col gap-10">
      {recommended.length > 0 && (
        <Section
          id="recommended"
          title="Recommended for you"
          description={`Based on where you use English: ${contextNames}.`}
        >
          <ScenarioGrid scenarios={recommended} />
        </Section>
      )}

      {groups.map((group) => (
        <Section
          key={group.category}
          id={`category-${group.category}`}
          title={SCENARIO_CATEGORY_LABELS[group.category]}
        >
          <ScenarioGrid scenarios={group.scenarios} />
        </Section>
      ))}

      <Section
        id="your-scenarios"
        title="Your scenarios"
        description="Situations from your own life, set up the way they really happen."
      >
        {scenarios.custom.length > 0 ? (
          <ScenarioGrid scenarios={scenarios.custom} />
        ) : (
          <EmptyState
            icon={<Plus className="size-5" />}
            title="Practice a situation from your own life"
            description="A meeting with your advisor, a call with your landlord: describe it once and practice it whenever you like."
            action={
              <Button asChild variant="outline">
                <Link href="/simulator/custom">Create a scenario</Link>
              </Button>
            }
          />
        )}
      </Section>
    </div>
  );
}

export default function SimulatorPage() {
  return (
    <>
      <PageHeader
        title="Real-Life Simulator"
        description="Pick a situation, read the brief, and have the conversation. Feedback comes after you finish, not during."
        actions={
          <Button asChild>
            <Link href="/simulator/custom">
              <Plus aria-hidden />
              Create your own
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Catalog />
      </Suspense>
    </>
  );
}
