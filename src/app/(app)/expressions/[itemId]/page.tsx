import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { ItemDetailPage } from "@/components/studio/item-detail";

export const metadata: Metadata = { title: "Saved expression" };

async function Content({ params }: { params: PageProps<"/expressions/[itemId]">["params"] }) {
  const { itemId } = await params;
  return <ItemDetailPage itemId={itemId} section="expressions" />;
}

export default function SavedExpressionPage({ params }: PageProps<"/expressions/[itemId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
