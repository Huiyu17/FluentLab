import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Gap Tracker" };

export default function GapTrackerPage() {
  return (
    <PlaceholderPage
      title="Gap Tracker"
      description="Patterns FluentLab has noticed across your conversations."
      milestone="M8"
      comingNext="Finish a conversation to see your gaps. Each gap shows how often it appeared, with real examples."
    />
  );
}
