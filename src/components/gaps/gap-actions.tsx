"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { dismissGapAction, restoreGapAction } from "@/lib/actions/gaps";

function Submit({
  idle,
  busy,
  variant = "outline",
}: {
  idle: string;
  busy: string;
  variant?: "outline" | "default";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? busy : idle}
    </Button>
  );
}

/** Dismiss (with an inline confirm) or restore a gap. */
export function GapActions({
  gapId,
  title,
  dismissed,
}: {
  gapId: string;
  title: string;
  dismissed: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (dismissed) {
    return (
      <form action={restoreGapAction}>
        <input type="hidden" name="gapId" value={gapId} />
        <Submit idle="Restore" busy="Restoring…" />
      </form>
    );
  }
  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Dismiss
      </Button>
    );
  }
  return (
    <form action={dismissGapAction} className="flex flex-wrap items-center gap-2" aria-live="polite">
      <span className="text-sm">Stop tracking &ldquo;{title}&rdquo;? You can restore it later.</span>
      <input type="hidden" name="gapId" value={gapId} />
      <Submit idle="Dismiss" busy="Dismissing…" variant="default" />
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep it
      </Button>
    </form>
  );
}
