"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" size="sm" disabled={pending}>
      {pending ? "Deleting…" : "Delete"}
    </Button>
  );
}

/**
 * Two-step delete: the first click asks for confirmation inline (no browser dialog), the second
 * submits `fields` to `action`, a Server Action that deletes and redirects.
 */
export function ConfirmDelete({
  action,
  fields,
  question,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  question: string;
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
    <form action={action} className="flex flex-wrap items-center gap-2" aria-live="polite">
      <span className="text-sm">{question}</span>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <ConfirmButton />
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </form>
  );
}
