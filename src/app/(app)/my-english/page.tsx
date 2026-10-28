import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "My English" };

export default function MyEnglishPage() {
  return (
    <PlaceholderPage
      title="My English"
      description="Everything you've saved, ready to review and reuse in conversation."
      milestone="M4"
      comingNext="Words and expressions you save from the Studio, reviews and debriefs will collect here."
    />
  );
}
