import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Custom scenario" };

export default function CustomscenarioPage() {
  return (
    <PlaceholderPage
      title="Custom scenario"
      description="Describe a situation you want to practice."
      milestone="M5"
      comingNext="Create your own scenario: who you are, who you're talking to, and what you want to achieve."
    />
  );
}
