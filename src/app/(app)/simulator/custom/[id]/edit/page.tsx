import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shell/page-header";
import { ScenarioForm } from "@/components/simulator/scenario-form";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { getCustomScenario } from "@/lib/data/scenarios";

export const metadata: Metadata = { title: "Edit scenario" };

async function EditScenario({ params }: { params: PageProps<"/simulator/custom/[id]/edit">["params"] }) {
  const { id } = await params;
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<MessagesSquare className="size-5" />}
        title="Custom scenarios need an account"
        description="Supabase is not configured, so scenarios can't be edited."
      />
    );
  }

  const { user } = await requireOnboardedUser(`/simulator/custom/${id}/edit`);
  const scenario = await getCustomScenario(user.id, id);
  if (!scenario) notFound();

  return (
    <ScenarioForm
      scenarioId={scenario.id}
      cancelHref={`/simulator/custom/${scenario.id}`}
      initial={{
        title: scenario.title,
        description: scenario.description,
        userRole: scenario.userRole,
        aiRole: scenario.aiRole,
        aiPersonality: scenario.aiPersonality,
        goal: scenario.goal,
        difficulty: scenario.difficulty,
        openingLine: scenario.openingLine ?? "",
        estMinutes: scenario.estMinutes,
      }}
    />
  );
}

export default function EditScenarioPage({ params }: PageProps<"/simulator/custom/[id]/edit">) {
  return (
    <>
      <PageHeader title="Edit scenario" description="Changes apply to conversations you start from now on." />
      <Suspense fallback={<PageSkeleton />}>
        <EditScenario params={params} />
      </Suspense>
    </>
  );
}
