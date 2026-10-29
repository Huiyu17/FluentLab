import { Suspense, type ReactNode } from "react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { AccountMenu } from "@/components/shell/account-menu";
import { AppGate } from "@/components/shell/app-gate";
import { AppShell } from "@/components/shell/app-shell";

// The sidebar is static; the session-dependent parts (gate, account) stream in behind Suspense.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      account={
        <Suspense fallback={null}>
          <AccountMenu />
        </Suspense>
      }
    >
      <Suspense fallback={<PageSkeleton />}>
        <AppGate>{children}</AppGate>
      </Suspense>
    </AppShell>
  );
}
