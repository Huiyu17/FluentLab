import { MessagesSquare } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shell/page-header";
import { ScenarioForm } from "@/components/simulator/scenario-form";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Create a scenario" };

async function CreateScenario() {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<MessagesSquare className="size-5" />}
        title="Custom scenarios need an account"
        description="Supabase is not configured, so scenarios can't be saved yet."
      />
    );
  }

  const { profile } = await requireOnboardedUser("/simulator/custom");
  return (
    <ScenarioForm
      cancelHref="/simulator"
      initial={{
        title: "",
        description: "",
        userRole: "",
        aiRole: "",
        aiPersonality: "",
        goal: "",
        difficulty: profile.englishLevel ?? "intermediate",
        openingLine: "",
        estMinutes: 8,
      }}
    />
  );
}

export default function CreateScenarioPage() {
  return (
    <>
      <PageHeader
        title="Create a scenario"
        description="Describe a real situation once, then practice it as often as you like."
      />
      <Suspense fallback={<PageSkeleton />}>
        <CreateScenario />
      </Suspense>
    </>
  );
}
