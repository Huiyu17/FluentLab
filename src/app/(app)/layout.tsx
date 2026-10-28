import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

// Auth + onboarding gating is added in M2 (data access layer, not here in the static shell).
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
