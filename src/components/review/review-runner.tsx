"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorState } from "@/components/shared/states";
import { runReviewAction } from "@/lib/actions/conversation-review";
import { cn } from "@/lib/utils";

const STEPS = ["Reading your conversation", "Finding natural alternatives", "Saving your review"] as const;
/** The reviewer is one call, so the first step is shown briefly and the second until it returns. */
const READING_MS = 2000;
/** How long to wait before asking again when another tab is running the review. */
const WAIT_MS = 15_000;

type Phase =
  | { kind: "running"; step: number }
  | { kind: "waiting" }
  | { kind: "failed"; message: string; canRetry: boolean };

/**
 * Runs the review of an ended conversation and shows its progress (docs/ARCHITECTURE.md → Error and
 * loading states). Starts by itself for a conversation waiting in `reviewing`; a failed review waits
 * for "Try again", so a broken provider doesn't spend quota on every visit.
 */
export function ReviewRunner({
  conversationId,
  failure,
}: {
  conversationId: string;
  /** Set when the last attempt failed (`failed_review`). */
  failure?: { message: string; canRetry: boolean };
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(
    failure ? { kind: "failed", ...failure } : { kind: "running", step: 0 },
  );
  const started = useRef(false);
  const mounted = useRef(true);

  const run = useCallback(async () => {
    setPhase({ kind: "running", step: 0 });
    const timer = setTimeout(() => mounted.current && setPhase({ kind: "running", step: 1 }), READING_MS);
    let result: Awaited<ReturnType<typeof runReviewAction>>;
    try {
      result = await runReviewAction(conversationId);
    } catch {
      result = {
        status: "failed",
        message: "We couldn't reach FluentLab. Check your connection and try again.",
        canRetry: true,
      };
    } finally {
      clearTimeout(timer);
    }
    if (!mounted.current) return;

    switch (result.status) {
      case "completed":
        setPhase({ kind: "running", step: 2 });
        router.refresh();
        break;
      case "in_progress":
        setPhase({ kind: "waiting" });
        break;
      case "active":
        router.push(`/conversations/${conversationId}`);
        break;
      case "abandoned":
      case "missing":
        router.refresh();
        break;
      case "failed":
        setPhase({ kind: "failed", message: result.message, canRetry: result.canRetry });
        break;
    }
  }, [conversationId, router]);

  useEffect(() => {
    mounted.current = true;
    // Once per mount (Strict Mode runs effects twice in development).
    if (!failure && !started.current) {
      started.current = true;
      void run();
    }
    return () => {
      mounted.current = false;
    };
  }, [failure, run]);

  // Another tab holds the review: ask again later (it may finish, or its claim may go stale).
  useEffect(() => {
    if (phase.kind !== "waiting") return;
    const timer = setTimeout(() => void run(), WAIT_MS);
    return () => clearTimeout(timer);
  }, [phase.kind, run]);

  if (phase.kind === "failed") {
    return (
      <ErrorState
        title="Your review didn't finish"
        description={phase.message}
        onRetry={phase.canRetry ? () => void run() : undefined}
      />
    );
  }

  return (
    <section
      aria-labelledby="review-progress-title"
      className="flex flex-col gap-4 rounded-2xl border bg-card p-6 sm:p-8"
    >
      <h2 id="review-progress-title" className="font-serif text-xl font-semibold">
        {phase.kind === "waiting" ? "Your review is already being prepared" : "Preparing your review"}
      </h2>
      <p role="status" className="text-sm text-muted-foreground">
        {phase.kind === "waiting"
          ? "It was started in another tab or window. We'll check again in a few seconds."
          : `${STEPS[phase.step]}… This usually takes 10–40 seconds.`}
      </p>
      {phase.kind === "running" && (
        <ol className="flex flex-col gap-2.5">
          {STEPS.map((label, i) => {
            const done = i < phase.step;
            const current = i === phase.step;
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-2.5 text-sm",
                  !done && !current && "text-muted-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full",
                    done
                      ? "bg-primary text-primary-foreground"
                      : current
                        ? "bg-primary-soft text-primary"
                        : "bg-muted",
                  )}
                >
                  {done ? (
                    <Check className="size-3.5" />
                  ) : current ? (
                    <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                  ) : null}
                </span>
                {label}
                <span className="sr-only">{done ? " (done)" : current ? " (in progress)" : ""}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
