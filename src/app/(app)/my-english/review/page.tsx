import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Review session" };

export default function ReviewsessionPage() {
  return (
    <PlaceholderPage
      title="Review session"
      description="A short review of the items that are due."
      milestone="M4"
      comingNext="Recall each item, then use it in a sentence of your own."
    />
  );
}
