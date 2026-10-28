import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Conversation" };

// Reads params.id once implemented (M6).
export default function ConversationPage() {
  return (
    <PlaceholderPage
      title="Conversation"
      description="Your conversation."
      milestone="M6"
      comingNext="The live chat (or the transcript, once finished) will appear here."
    />
  );
}
