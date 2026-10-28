import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Fluency Profile" };

export default function FluencyProfilePage() {
  return (
    <PlaceholderPage
      title="Fluency Profile"
      description="AI-estimated learning indicators over time. Not an official or CEFR assessment."
      milestone="M9"
      comingNext="Trends for fluency, naturalness, grammar, vocabulary and confidence will appear here."
    />
  );
}
