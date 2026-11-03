"use client";

import { NotebookPen } from "lucide-react";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createDebriefAction } from "@/lib/actions/debrief";
import { IDLE_DEBRIEF_STATE } from "@/lib/actions/debrief-state";
import { DEBRIEF_LIMITS } from "@/lib/validation/debrief";

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  max,
  rows,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  rows: number;
  placeholder: string;
  error?: string;
}) {
  const describedBy = error ? `${id}-error` : `${id}-hint`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={id}
        rows={rows}
        maxLength={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="flex justify-between gap-3 text-sm text-muted-foreground">
          <span>{hint}</span>
          <span className="shrink-0 tabular-nums">
            {value.length}/{max}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * New debrief. Controlled fields submitted with startTransition (not `<form action>`), so React's
 * post-action reset never clears them: after a failure the learner's text is still there.
 */
export function DebriefForm() {
  const [state, action, pending] = useActionState(createDebriefAction, IDLE_DEBRIEF_STATE);
  const [situation, setSituation] = useState("");
  const [whatYouSaid, setWhatYouSaid] = useState("");
  const errors = state.status === "error" ? state.fieldErrors : undefined;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-labelledby="new-debrief-title"
      className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id="new-debrief-title" className="font-serif text-xl font-semibold">
          New debrief
        </h2>
        <p className="text-sm text-muted-foreground">
          A conversation you just had in English, or one coming up. You&apos;ll get natural ways to say it and
          a scene to practice it in.
        </p>
      </div>
      <Field
        id="situation"
        label="What happened?"
        hint="Where you were, who you talked to, and what you wanted."
        value={situation}
        onChange={setSituation}
        max={DEBRIEF_LIMITS.situation}
        rows={4}
        placeholder="At the pharmacy I wanted to ask whether my prescription was ready, but the pharmacist talked very fast…"
        error={errors?.situation}
      />
      <Field
        id="whatYouSaid"
        label="What did you say? (optional)"
        hint="Your words, as well as you remember them."
        value={whatYouSaid}
        onChange={setWhatYouSaid}
        max={DEBRIEF_LIMITS.whatYouSaid}
        rows={2}
        placeholder="Is my medicine finish? I wait long time."
        error={errors?.whatYouSaid}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Uses one AI request. Don&apos;t include private details like full names or addresses.
        </p>
        <Button type="submit" disabled={pending}>
          <NotebookPen aria-hidden />
          {pending ? "Debriefing…" : "Debrief it"}
        </Button>
      </div>
      {state.status === "error" && state.message && (
        <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}
    </form>
  );
}
