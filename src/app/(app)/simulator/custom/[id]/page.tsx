import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { PageSkeleton } from "@/components/shared/skeletons";
import { BriefPage } from "@/components/simulator/brief-page";
import { ScenarioOwnerActions } from "@/components/simulator/scenario-owner-actions";

export const metadata: Metadata = { title: "Your scenario" };

/** `?gap=<id>` from "Practice this" on a gap; anything else is ignored. */
async function gapParam(
  searchParams: PageProps<"/simulator/custom/[id]">["searchParams"],
): Promise<string | null> {
  const { gap } = await searchParams;
  const parsed = z.uuid().safeParse(gap);
  return parsed.success ? parsed.data : null;
}

async function Content({
  params,
  searchParams,
}: {
  params: PageProps<"/simulator/custom/[id]">["params"];
  searchParams: PageProps<"/simulator/custom/[id]">["searchParams"];
}) {
  const { id } = await params;
  return (
    <BriefPage
      source={{ kind: "custom", id }}
      gapId={await gapParam(searchParams)}
      actions={(scenario) => <ScenarioOwnerActions id={scenario.id} title={scenario.title} />}
    />
  );
}

export default function CustomScenarioPage({ params, searchParams }: PageProps<"/simulator/custom/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}
