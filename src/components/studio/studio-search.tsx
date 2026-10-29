"use client";

import { Check, Plus } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { explainExpressionAction, saveStudioCardAction } from "@/lib/actions/studio";
import { IDLE_SAVE_STATE, IDLE_STUDIO_STATE } from "@/lib/actions/studio-state";
import type { StudioCard } from "@/lib/ai/schemas/studio";
import { itemHref } from "@/lib/items";
import { STUDIO_INPUT_MAX, type StudioKind } from "@/lib/validation/studio";
import { StudioCardView } from "./studio-card";

function SaveToMyEnglish({
  card,
  savedItemId,
  savedItemIds,
  canSave,
}: {
  card: StudioCard;
  savedItemId: string | null;
  savedItemIds: ReadonlySet<string>;
  canSave: boolean;
}) {
  const [state, action, pending] = useActionState(saveStudioCardAction, IDLE_SAVE_STATE);
  // Client state can outlive the item: Next keeps this page's state across navigations, so a
  // card saved here and then deleted elsewhere would still say "Added". Trust the server's list,
  // which the save action's refresh() and every navigation re-render.
  const candidate = state.status === "saved" ? state.itemId : savedItemId;
  const itemId = candidate && savedItemIds.has(candidate) ? candidate : null;

  if (itemId) {
    return (
      <div className="flex flex-col items-end gap-1" aria-live="polite">
        <span className="flex items-center gap-1.5 text-sm font-medium text-primary">
          <Check aria-hidden className="size-4" />
          {state.status === "saved" && !state.alreadySaved ? "Added to My English" : "In My English"}
        </span>
        <Link
          href={itemHref(card.type, itemId)}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          View saved card
        </Link>
      </div>
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col items-end gap-1">
      <input type="hidden" name="card" value={JSON.stringify(card)} />
      <Button type="submit" disabled={!canSave || pending}>
        <Plus aria-hidden />
        {pending ? "Adding…" : "Add to My English"}
      </Button>
      {!canSave && <span className="text-xs text-muted-foreground">Saving needs an account.</span>}
      {state.status === "error" && (
        <span role="alert" className="text-sm text-destructive">
          {state.message}
        </span>
      )}
    </form>
  );
}

/** Studio search box and result. Words on /vocabulary, phrases and expressions on /expressions. */
export function StudioSearch({
  kind,
  canSave,
  suggestions,
  savedItemIds = [],
}: {
  kind: StudioKind;
  canSave: boolean;
  suggestions: readonly string[];
  /** Ids of every item the learner has saved right now (any type), from the server. */
  savedItemIds?: readonly string[];
}) {
  const [state, action, pending] = useActionState(explainExpressionAction, IDLE_STUDIO_STATE);
  const savedSet = new Set(savedItemIds);
  const [value, setValue] = useState("");
  const inputId = `studio-${kind}`;
  const errorId = `${inputId}-error`;

  function submit(expression: string) {
    const formData = new FormData();
    formData.set("expression", expression);
    formData.set("kind", kind);
    startTransition(() => action(formData));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(value);
  }

  const error = state.status === "error" ? state.message : null;

  return (
    <div className="flex flex-col gap-6">
      <form role="search" onSubmit={onSubmit} className="flex max-w-[720px] flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium">
          {kind === "vocabulary" ? "Look up a word" : "Look up a phrase or expression"}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={inputId}
            name="expression"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={kind === "vocabulary" ? "e.g. tentative" : "e.g. touch base"}
            maxLength={STUDIO_INPUT_MAX}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="h-11"
          />
          <Button type="submit" disabled={pending} className="h-11 sm:w-32">
            {pending ? "Explaining…" : "Explain"}
          </Button>
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {state.status === "idle" && suggestions.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Try:
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={pending}
                onClick={() => {
                  setValue(suggestion);
                  submit(suggestion);
                }}
              >
                {suggestion}
              </Button>
            ))}
          </p>
        )}
      </form>

      <div aria-live="polite" aria-busy={pending}>
        {pending ? (
          <div
            role="status"
            aria-label="Writing the explanation"
            className="flex max-w-[720px] flex-col gap-4 rounded-2xl border bg-card p-8"
          >
            <Skeleton className="h-8 w-48 rounded-lg" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-5/6 rounded" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          state.status === "result" && (
            <StudioCardView
              card={state.card}
              sample={state.sample}
              actions={
                <SaveToMyEnglish
                  key={state.resultAt}
                  card={state.card}
                  savedItemId={state.savedItemId}
                  savedItemIds={savedSet}
                  canSave={canSave}
                />
              }
            />
          )
        )}
      </div>
    </div>
  );
}
