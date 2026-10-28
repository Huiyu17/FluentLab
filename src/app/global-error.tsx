"use client";

import "./globals.css";

// Replaces the root layout when it fails, so it must render <html> and <body>.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-background p-6 font-sans">
        <div role="alert" className="flex max-w-md flex-col items-center gap-3 text-center">
          <h1 className="text-xl font-semibold">FluentLab ran into a problem</h1>
          <p className="text-muted-foreground">Please try again. Your progress is safe.</p>
          <button
            type="button"
            onClick={retry}
            className="mt-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
