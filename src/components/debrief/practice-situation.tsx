"use client";

import { MessagesSquare } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { practiceDebriefAction } from "@/lib/actions/debrief";
import { IDLE_PRACTICE_STATE } from "@/lib/actions/debrief-state";

/**
 * Opens the practice scenario for a debrief, creating it the first time. `scenarioId` comes from
 * the server on every render, so a scenario deleted elsewhere shows "Practice" again.
 */
export function PracticeSituation({
  debriefId,
  scenarioId,
}: {
  debriefId: string;
  scenarioId: string | null;
}) {
  const [state, action, pending] = useActionState(practiceDebriefAction, IDLE_PRACTICE_STATE);

  if (scenarioId) {
    return (
      <Button asChild>
        <Link href={`/simulator/custom/${scenarioId}`}>
          <MessagesSquare aria-hidden />
          Open your practice scenario
        </Link>
      </Button>
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col items-start gap-2">
      <input type="hidden" name="debriefId" value={debriefId} />
      <Button type="submit" disabled={pending}>
        <MessagesSquare aria-hidden />
        {pending ? "Creating…" : "Practice this situation"}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
