import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { PageSkeleton } from "@/components/shared/skeletons";
import { BriefPage } from "@/components/simulator/brief-page";

export const metadata: Metadata = { title: "Scenario" };

/** `?gap=<id>` from "Practice this" on a gap; anything else is ignored. */
async function gapParam(
  searchParams: PageProps<"/simulator/[scenarioSlug]">["searchParams"],
): Promise<string | null> {
  const { gap } = await searchParams;
  const parsed = z.uuid().safeParse(gap);
  return parsed.success ? parsed.data : null;
}

async function Content({
  params,
  searchParams,
}: {
  params: PageProps<"/simulator/[scenarioSlug]">["params"];
  searchParams: PageProps<"/simulator/[scenarioSlug]">["searchParams"];
}) {
  const { scenarioSlug } = await params;
  return <BriefPage source={{ kind: "shared", slug: scenarioSlug }} gapId={await gapParam(searchParams)} />;
}

export default function ScenarioPage({ params, searchParams }: PageProps<"/simulator/[scenarioSlug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}
