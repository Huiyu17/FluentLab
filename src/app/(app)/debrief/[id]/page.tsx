import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Debrief" };

// Reads params.id once implemented (M10).
export default function DebriefPage() {
  return (
    <PlaceholderPage
      title="Debrief"
      description="Better ways to handle a real situation."
      milestone="M10"
      comingNext="Suggested phrasings and a Practice this situation button will appear here."
    />
  );
}
