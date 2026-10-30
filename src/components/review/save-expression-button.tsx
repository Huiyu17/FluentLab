"use client";

import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { saveReviewExpressionAction } from "@/lib/actions/conversation-review";
import { IDLE_SAVE_STATE } from "@/lib/actions/studio-state";
import { itemHref } from "@/lib/items";

/**
 * "Add to My English" for one expression of a correction. Saved state comes from the server
 * (`savedItemId`), not the action result: page state survives navigations, so a copy deleted
 * elsewhere must not still show as saved. The action's refresh() updates it.
 */
export function SaveExpressionButton({
  correctionId,
  index,
  expression,
  savedItemId,
}: {
  correctionId: string;
  index: number;
  expression: string;
  savedItemId: string | null;
}) {
  const [state, action, pending] = useActionState(saveReviewExpressionAction, IDLE_SAVE_STATE);

  if (savedItemId) {
    return (
      <Link
        href={itemHref("expression", savedItemId)}
        aria-label={`In My English: ${expression}`}
        className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <Check aria-hidden className="size-4" />
        In My English
      </Link>
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form onSubmit={onSubmit} className="flex shrink-0 flex-col items-end gap-1">
      <input type="hidden" name="correctionId" value={correctionId} />
      <input type="hidden" name="index" value={index} />
      {/* The label starts with the visible words so voice control ("click Add") still works. */}
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label={`${pending ? "Adding" : "Add to My English"}: ${expression}`}
      >
        <Plus aria-hidden />
        {pending ? "Adding…" : "Add to My English"}
      </Button>
      {state.status === "error" && (
        <span role="alert" className="text-xs text-destructive">
          {state.message}
        </span>
      )}
    </form>
  );
}
