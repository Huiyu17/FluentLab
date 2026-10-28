import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Scenario" };

// Reads params.scenarioSlug once implemented (M5).
export default function ScenarioPage() {
  return (
    <PlaceholderPage
      title="Scenario"
      description="Read the brief, then start the conversation."
      milestone="M5"
      comingNext="The scenario brief, difficulty, goal and Start button will appear here."
    />
  );
}
