import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Real-Life Simulator" };

export default function RealLifeSimulatorPage() {
  return (
    <PlaceholderPage
      title="Real-Life Simulator"
      description="Practice conversations from campus, social life, everyday errands, career and travel."
      milestone="M5"
      comingNext="Pick a situation, read the brief, and start a conversation. Feedback comes after you finish, not during."
    />
  );
}
