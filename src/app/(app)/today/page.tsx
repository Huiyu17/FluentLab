import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <PlaceholderPage
      title="Today"
      description="Your plan for today, what to focus on this week, and what you practiced recently."
      milestone="M3"
      comingNext="Your daily plan, streak, focus gaps and due reviews will appear here."
    />
  );
}
