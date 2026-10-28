import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Conversation History" };

export default function ConversationHistoryPage() {
  return (
    <PlaceholderPage
      title="Conversation History"
      description="Every conversation you've had, with its review."
      milestone="M6"
      comingNext="Your past conversations and their reviews will be listed here."
    />
  );
}
