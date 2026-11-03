"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/states";

/**
 * Error boundary for pages outside the app shell (landing, sign-in, sign-up, onboarding). Keeps
 * the root layout, unlike global-error.tsx, which only takes over when the layout itself fails.
 * The (app) group has its own boundary inside the shell.
 */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // Log the digest only; never render server error details.
    const digest = error instanceof Error && "digest" in error ? error.digest : undefined;
    console.error("Route error", digest ?? error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <ErrorState className="w-full max-w-md" onRetry={retry} />
    </main>
  );
}
