import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/shared/placeholder-page";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PlaceholderPage
      title="Settings"
      description="Your profile, goals and account."
      milestone="M2"
      comingNext="Edit your native language, level, learning goal and daily minutes here."
    />
  );
}
