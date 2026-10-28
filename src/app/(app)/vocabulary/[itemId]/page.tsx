import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Saved word" };

// Reads params.itemId once implemented (M4).
export default function SavedwordPage() {
  return (
    <PlaceholderPage
      title="Saved word"
      description="A word from My English."
      milestone="M4"
      comingNext="The full word card and your review history will appear here."
    />
  );
}
