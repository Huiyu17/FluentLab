"use client";

import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { IDLE_SAVE_STATE, type SaveItemState } from "@/lib/actions/studio-state";
import { itemHref } from "@/lib/items";

/**
 * "Add to My English" for one expression of a review correction or a debrief. `fields` only say
 * which expression (an id and an index); the Server Action reads the text from the database.
 * Saved state comes from the server (`savedItemId`), not the action result: page state survives
 * navigations, so a copy deleted elsewhere must not still show as saved. The action's refresh()
 * updates it.
 */
export function SaveExpressionButton({
  action: saveAction,
  fields,
  expression,
  savedItemId,
}: {
  action: (prev: SaveItemState, formData: FormData) => Promise<SaveItemState>;
  fields: Record<string, string>;
  expression: string;
  savedItemId: string | null;
}) {
  const [state, action, pending] = useActionState(saveAction, IDLE_SAVE_STATE);

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
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
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
