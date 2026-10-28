import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Vocabulary" };

export default function VocabularyPage() {
  return (
    <PlaceholderPage
      title="Vocabulary"
      description="Look up a word and learn how native speakers actually use it."
      milestone="M4"
      comingNext="Search any word to get its core meaning, native intuition, common patterns and mistakes, then add it to My English."
    />
  );
}
