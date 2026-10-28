import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Saved expression" };

// Reads params.itemId once implemented (M4).
export default function SavedexpressionPage() {
  return (
    <PlaceholderPage
      title="Saved expression"
      description="An expression from My English."
      milestone="M4"
      comingNext="The full expression card and a practice scenario will appear here."
    />
  );
}
