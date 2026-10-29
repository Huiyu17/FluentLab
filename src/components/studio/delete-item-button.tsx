"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { deleteItemAction } from "@/lib/actions/studio";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" size="sm" disabled={pending}>
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}

/** Two-step delete: the first click asks for confirmation inline (no browser dialog). */
export function DeleteItemButton({
  itemId,
  expression,
  back,
}: {
  itemId: string;
  expression: string;
  back: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 aria-hidden />
        Delete
      </Button>
    );
  }

  return (
    <form action={deleteItemAction} className="flex flex-wrap items-center gap-2" aria-live="polite">
      <span className="text-sm">Delete &ldquo;{expression}&rdquo; and its review history?</span>
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="back" value={back} />
      <ConfirmButton />
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </form>
  );
}
