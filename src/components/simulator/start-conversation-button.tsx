"use client";

import { MessagesSquare } from "lucide-react";
import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { startConversationAction } from "@/lib/actions/conversation";
import { IDLE_START_STATE } from "@/lib/actions/conversation-state";

/** Starts (or resumes) the conversation and lands in the chat. */
export function StartConversationButton({ slug, scenarioId }: { slug: string | null; scenarioId: string }) {
  const [state, action, pending] = useActionState(startConversationAction, IDLE_START_STATE);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col items-end gap-2">
      {slug ? (
        <input type="hidden" name="slug" value={slug} />
      ) : (
        <input type="hidden" name="scenarioId" value={scenarioId} />
      )}
      <Button type="submit" disabled={pending}>
        <MessagesSquare aria-hidden />
        {pending ? "Starting…" : "Start conversation"}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="max-w-xs text-right text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
