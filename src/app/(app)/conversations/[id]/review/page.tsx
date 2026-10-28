import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Conversation Review" };

// Reads params.id once implemented (M7).
export default function ConversationReviewPage() {
  return (
    <PlaceholderPage
      title="Conversation Review"
      description="What you said, how a native speaker might say it, and why."
      milestone="M7"
      comingNext="Sentence-by-sentence feedback, AI-estimated learning indicators, and expressions worth saving will appear here."
    />
  );
}
