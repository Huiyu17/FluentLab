"use client";

import Link from "next/link";
import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createScenarioAction, updateScenarioAction } from "@/lib/actions/scenario";
import { IDLE_SCENARIO_STATE, type ScenarioFormState } from "@/lib/actions/scenario-state";
import { ENGLISH_LEVELS, ENGLISH_LEVEL_LABELS, type EnglishLevel } from "@/lib/validation/profile";
import {
  CustomScenarioSchema,
  EST_MINUTES_OPTIONS,
  SCENARIO_LIMITS,
  type CustomScenarioField,
} from "@/lib/validation/scenario";

export type ScenarioFormValues = {
  title: string;
  description: string;
  userRole: string;
  aiRole: string;
  aiPersonality: string;
  goal: string;
  difficulty: EnglishLevel;
  openingLine: string;
  estMinutes: number;
};

type Errors = Partial<Record<CustomScenarioField, string>>;

const chip =
  "cursor-pointer rounded-full border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2";

function TextArea({
  id,
  label,
  hint,
  optional,
  rows = 2,
  value,
  onChange,
  error,
  placeholder,
}: {
  id: CustomScenarioField;
  label: string;
  hint?: string;
  optional?: boolean;
  rows?: number;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
        {label} {optional && <span className="font-normal text-muted-foreground">(optional)</span>}
      </Label>
      {hint && (
        <p id={hintId} className="-mt-1 text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <Textarea
        id={id}
        name={id}
        rows={rows}
        maxLength={SCENARIO_LIMITS[id as keyof typeof SCENARIO_LIMITS]}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
      />
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ChoiceGroup({ legend, error, children }: { legend: string; error?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3" aria-invalid={error ? true : undefined}>
      <legend className="mb-3 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </fieldset>
  );
}

/** Create or edit a custom scenario. Submitted by hand so React's form reset can't revert choices. */
export function ScenarioForm({
  initial,
  scenarioId,
  cancelHref,
}: {
  initial: ScenarioFormValues;
  /** Present when editing. */
  scenarioId?: string;
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState<ScenarioFormState, FormData>(
    scenarioId ? updateScenarioAction : createScenarioAction,
    IDLE_SCENARIO_STATE,
  );
  const [values, setValues] = useState(initial);
  const [clientErrors, setClientErrors] = useState<Errors>({});
  const [shownState, setShownState] = useState(state);

  if (state !== shownState) {
    setShownState(state);
    if (state.status === "error" && state.fieldErrors) setClientErrors(state.fieldErrors);
  }

  const set =
    <K extends keyof ScenarioFormValues>(field: K) =>
    (value: ScenarioFormValues[K]) => {
      setValues((v) => ({ ...v, [field]: value }));
      setClientErrors((errors) => ({ ...errors, [field]: undefined }));
    };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = CustomScenarioSchema.safeParse(values);
    if (!result.success) {
      const errors: Errors = {};
      for (const issue of result.error.issues) errors[issue.path[0] as CustomScenarioField] ??= issue.message;
      setClientErrors(errors);
      return;
    }
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  const minuteOptions = (EST_MINUTES_OPTIONS as readonly number[]).includes(values.estMinutes)
    ? EST_MINUTES_OPTIONS
    : [...EST_MINUTES_OPTIONS, values.estMinutes].sort((a, b) => a - b);
  const formError = state.status === "error" ? state.message : undefined;
  const hasErrors = Object.values(clientErrors).some(Boolean);

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-2xl flex-col gap-6">
      {scenarioId && <input type="hidden" name="id" value={scenarioId} />}

      <section className="flex flex-col gap-5 rounded-2xl border bg-card p-6">
        <FormField
          id="title"
          name="title"
          label="Title"
          maxLength={SCENARIO_LIMITS.title}
          placeholder="e.g. Asking my advisor for an extension"
          value={values.title}
          onChange={(e) => set("title")(e.target.value)}
          error={clientErrors.title}
        />
        <TextArea
          id="description"
          label="What's going on?"
          optional
          rows={3}
          hint="A little background, so the other person reacts realistically."
          value={values.description}
          onChange={set("description")}
          error={clientErrors.description}
        />
      </section>

      <section className="flex flex-col gap-5 rounded-2xl border bg-card p-6">
        <TextArea
          id="userRole"
          label="Who are you?"
          placeholder="e.g. A first-year PhD student whose experiment failed"
          value={values.userRole}
          onChange={set("userRole")}
          error={clientErrors.userRole}
        />
        <TextArea
          id="aiRole"
          label="Who are you talking to?"
          placeholder="e.g. My advisor, Dr. Chen"
          value={values.aiRole}
          onChange={set("aiRole")}
          error={clientErrors.aiRole}
        />
        <FormField
          id="aiPersonality"
          name="aiPersonality"
          label="What are they like? (optional)"
          maxLength={SCENARIO_LIMITS.aiPersonality}
          placeholder="e.g. Kind but very busy, a little impatient"
          value={values.aiPersonality}
          onChange={(e) => set("aiPersonality")(e.target.value)}
          error={clientErrors.aiPersonality}
        />
        <TextArea
          id="goal"
          label="Your goal"
          hint="What does a good outcome look like?"
          placeholder="e.g. Explain what happened and ask for one more week, without sounding like I'm making excuses."
          value={values.goal}
          onChange={set("goal")}
          error={clientErrors.goal}
        />
        <TextArea
          id="openingLine"
          label="How do they open the conversation?"
          optional
          hint="Leave it blank and they'll start in their own words."
          placeholder={'e.g. "Hi! Come on in. What did you want to talk about?"'}
          value={values.openingLine}
          onChange={set("openingLine")}
          error={clientErrors.openingLine}
        />
      </section>

      <section className="flex flex-col gap-6 rounded-2xl border bg-card p-6">
        <ChoiceGroup legend="Difficulty" error={clientErrors.difficulty}>
          {ENGLISH_LEVELS.map((level) => (
            <label key={level} className={chip}>
              <input
                type="radio"
                name="difficulty"
                value={level}
                checked={values.difficulty === level}
                onChange={() => set("difficulty")(level)}
                className="sr-only"
              />
              {ENGLISH_LEVEL_LABELS[level].label}
            </label>
          ))}
        </ChoiceGroup>
        <ChoiceGroup legend="About how long?" error={clientErrors.estMinutes}>
          {minuteOptions.map((minutes) => (
            <label key={minutes} className={chip}>
              <input
                type="radio"
                name="estMinutes"
                value={minutes}
                checked={values.estMinutes === minutes}
                onChange={() => set("estMinutes")(minutes)}
                className="sr-only"
              />
              {minutes} min
            </label>
          ))}
        </ChoiceGroup>
      </section>

      {formError && (
        <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2.5 text-sm">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : scenarioId ? "Save changes" : "Create scenario"}
        </Button>
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        {hasErrors && <span className="text-sm text-destructive">Please fix the highlighted fields.</span>}
      </div>
    </form>
  );
}
