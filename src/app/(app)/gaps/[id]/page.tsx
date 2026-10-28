import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Gap" };

// Reads params.id once implemented (M8).
export default function GapPage() {
  return (
    <PlaceholderPage
      title="Gap"
      description="One pattern, with the evidence behind it."
      milestone="M8"
      comingNext="Examples from your conversations, before and after, and a Practice this button will appear here."
    />
  );
}
