import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { BriefPage } from "@/components/simulator/brief-page";

export const metadata: Metadata = { title: "Scenario" };

async function Content({ params }: { params: PageProps<"/simulator/[scenarioSlug]">["params"] }) {
  const { scenarioSlug } = await params;
  return <BriefPage source={{ kind: "shared", slug: scenarioSlug }} />;
}

export default function ScenarioPage({ params }: PageProps<"/simulator/[scenarioSlug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
