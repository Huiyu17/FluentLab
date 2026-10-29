"use client";

import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { addCuratedAction } from "@/lib/actions/studio";
import { IDLE_SAVE_STATE } from "@/lib/actions/studio-state";
import type { CuratedExpression } from "@/lib/data/items";
import { REGISTER_LABELS, itemHref } from "@/lib/items";

function AddCurated({ item }: { item: CuratedExpression }) {
  const [state, action, pending] = useActionState(addCuratedAction, IDLE_SAVE_STATE);
  // The server's value, not the action result: page state survives navigations, so a saved
  // copy deleted elsewhere must not still show as saved. The add action's refresh() updates it.
  const savedId = item.savedItemId;

  if (savedId) {
    return (
      <Link
        href={itemHref("expression", savedId)}
        aria-label={`In My English: ${item.expression}`}
        className="flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
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
    <form onSubmit={onSubmit} className="flex flex-col items-end gap-1">
      <input type="hidden" name="curatedId" value={item.id} />
      {/* The label starts with the visible word so voice control ("click Add") still works. */}
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={pending}
        aria-label={`${pending ? "Adding" : "Add"}: ${item.expression}`}
      >
        <Plus aria-hidden />
        {pending ? "Adding…" : "Add"}
      </Button>
      {state.status === "error" && (
        <span role="alert" className="text-xs text-destructive">
          {state.message}
        </span>
      )}
    </form>
  );
}

/** Hand-picked expressions every learner can add in one click. */
export function CuratedList({ items }: { items: CuratedExpression[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium">{item.expression}</p>
            <AddCurated item={item} />
          </div>
          <p className="text-sm">{item.meaning}</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">When: </span>
            {item.usedWhen}
          </p>
          <p className="border-l-2 border-primary pl-3 text-sm">{item.example}</p>
          <p className="text-xs text-muted-foreground">{REGISTER_LABELS[item.register]}</p>
        </li>
      ))}
    </ul>
  );
}
