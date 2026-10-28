import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Real-Life Debrief" };

export default function RealLifeDebriefPage() {
  return (
    <PlaceholderPage
      title="Real-Life Debrief"
      description="Tell FluentLab about a real conversation and learn what you could say next time."
      milestone="M10"
      comingNext="Describe what happened today. You'll get natural phrasings and a chance to practice the same situation."
    />
  );
}
