import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Expressions" };

export default function ExpressionsPage() {
  return (
    <PlaceholderPage
      title="Expressions"
      description="Native expressions: what they mean, when people use them, and how they feel."
      milestone="M4"
      comingNext="Browse common native expressions or look one up, then practice it in a real situation."
    />
  );
}
