"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/states";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    // Log the digest only; never render server error details.
    const digest = error instanceof Error && "digest" in error ? error.digest : undefined;
    console.error("Route error", digest ?? error);
  }, [error]);

  return <ErrorState onRetry={retry} />;
}
