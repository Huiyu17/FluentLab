import type { ReactNode } from "react";
import { requireAppAccess } from "@/lib/auth/dal";

/**
 * Renders the page only for signed-in, onboarded users (redirects otherwise).
 * Reads the session, so it must sit behind <Suspense>; the sidebar outside it
 * stays in the static shell.
 */
export async function AppGate({ children }: { children: ReactNode }) {
  await requireAppAccess();
  return children;
}
