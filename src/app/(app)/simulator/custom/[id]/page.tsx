import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { BriefPage } from "@/components/simulator/brief-page";
import { ScenarioOwnerActions } from "@/components/simulator/scenario-owner-actions";

export const metadata: Metadata = { title: "Your scenario" };

async function Content({ params }: { params: PageProps<"/simulator/custom/[id]">["params"] }) {
  const { id } = await params;
  return (
    <BriefPage
      source={{ kind: "custom", id }}
      actions={(scenario) => <ScenarioOwnerActions id={scenario.id} title={scenario.title} />}
    />
  );
}

export default function CustomScenarioPage({ params }: PageProps<"/simulator/custom/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
