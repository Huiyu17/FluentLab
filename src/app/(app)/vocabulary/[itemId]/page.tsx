import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { ItemDetailPage } from "@/components/studio/item-detail";

export const metadata: Metadata = { title: "Saved word" };

async function Content({ params }: { params: PageProps<"/vocabulary/[itemId]">["params"] }) {
  const { itemId } = await params;
  return <ItemDetailPage itemId={itemId} section="vocabulary" />;
}

export default function SavedWordPage({ params }: PageProps<"/vocabulary/[itemId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}
