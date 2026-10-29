"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import {
  ContextsField,
  DailyGoalField,
  DisplayNameField,
  EnglishLevelField,
  LearningGoalField,
  NativeLanguageField,
  useDeviceTimeZone,
} from "@/components/profile/profile-fields";
import type { ProfileFieldErrors, ProfileValues } from "@/components/profile/profile-values";
import { Button } from "@/components/ui/button";
import { completeOnboarding } from "@/lib/actions/profile";
import { IDLE_PROFILE_STATE } from "@/lib/actions/profile-state";
import { ProfileSchema } from "@/lib/validation/profile";

const STEPS = [
  {
    title: "Nice to meet you",
    description: "Tell us a little about yourself.",
    schema: ProfileSchema.pick({ displayName: true, nativeLanguage: true }),
  },
  {
    title: "Your English today",
    description: "There's no test. Pick what feels closest.",
    schema: ProfileSchema.pick({ englishLevel: true }),
  },
  {
    title: "Where English matters for you",
    description: "We'll start you with conversations from these places.",
    schema: ProfileSchema.pick({ contexts: true, learningGoal: true }),
  },
  {
    title: "Your daily practice",
    description: "Last step. You can change all of this later in Settings.",
    schema: ProfileSchema.pick({ dailyGoalMinutes: true }),
  },
] as const;

const LAST = STEPS.length - 1;

function errorsFrom(error: z.ZodError): ProfileFieldErrors {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  return Object.fromEntries(Object.entries(flat).map(([field, messages]) => [field, messages?.[0]]));
}

function stepOf(errors: ProfileFieldErrors): number {
  const index = STEPS.findIndex((step) => Object.keys(step.schema.shape).some((field) => field in errors));
  return index === -1 ? LAST : index;
}

export function OnboardingWizard({ initial }: { initial: ProfileValues }) {
  const [state, action, pending] = useActionState(completeOnboarding, IDLE_PROFILE_STATE);
  const [step, setStep] = useState(0);
  // Controlled so values survive step changes.
  const [values, setValues] = useState<ProfileValues>(initial);
  const [clientErrors, setClientErrors] = useState<ProfileFieldErrors>({});
  const [shownState, setShownState] = useState(state);
  const deviceTimeZone = useDeviceTimeZone();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // When the server rejects a field, show it and jump to the step that owns it.
  if (state !== shownState) {
    setShownState(state);
    if (state.status === "error" && state.fieldErrors) {
      setClientErrors(state.fieldErrors);
      setStep(stepOf(state.fieldErrors));
    }
  }

  // Move focus to the new step's heading so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
    moved.current = true;
  }, [step]);

  const set =
    <K extends keyof ProfileValues>(field: K) =>
    (value: ProfileValues[K]) => {
      setValues((v) => ({ ...v, [field]: value }));
      setClientErrors((errors) => ({ ...errors, [field]: undefined }));
    };

  function validateStep(): boolean {
    const result = STEPS[step].schema.safeParse(values);
    if (result.success) return true;
    setClientErrors(errorsFrom(result.error));
    return false;
  }

  function next() {
    if (validateStep()) setStep((s) => Math.min(s + 1, LAST));
  }

  // Submitted by hand rather than via <form action>: React resets a form after its action,
  // which would put radios and checkboxes back to their first-render state if saving fails.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Enter on an earlier step means "Continue", not "submit".
    if (step < LAST) {
      next();
      return;
    }
    const result = ProfileSchema.safeParse(values);
    if (!result.success) {
      const errors = errorsFrom(result.error);
      setClientErrors(errors);
      setStep(stepOf(errors));
      return;
    }
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  const current = STEPS[step];
  const formError = state.status === "error" ? state.message : undefined;

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex w-full max-w-lg flex-col gap-6 rounded-2xl border bg-card p-6 sm:p-8"
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </p>
        <div
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          className="flex gap-1.5"
        >
          {STEPS.map((s, i) => (
            <span
              key={s.title}
              className={
                i <= step ? "h-1.5 flex-1 rounded-full bg-primary" : "h-1.5 flex-1 rounded-full bg-muted"
              }
            />
          ))}
        </div>
        <h1 ref={headingRef} tabIndex={-1} className="font-serif text-2xl font-semibold outline-none">
          {current.title}
        </h1>
        <p className="text-muted-foreground">{current.description}</p>
      </div>

      {formError && (
        <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2.5 text-sm">
          {formError}
        </p>
      )}

      {/* Every step stays mounted (hidden) so the final submit includes all fields. */}
      <div hidden={step !== 0} className="flex flex-col gap-5">
        <DisplayNameField
          value={values.displayName}
          onChange={set("displayName")}
          error={clientErrors.displayName}
        />
        <NativeLanguageField
          value={values.nativeLanguage}
          onChange={set("nativeLanguage")}
          error={clientErrors.nativeLanguage}
        />
      </div>
      <div hidden={step !== 1}>
        <EnglishLevelField
          value={values.englishLevel}
          onChange={set("englishLevel")}
          error={clientErrors.englishLevel}
        />
      </div>
      <div hidden={step !== 2} className="flex flex-col gap-6">
        <ContextsField value={values.contexts} onChange={set("contexts")} error={clientErrors.contexts} />
        <LearningGoalField
          value={values.learningGoal}
          onChange={set("learningGoal")}
          error={clientErrors.learningGoal}
        />
      </div>
      <div hidden={step !== 3}>
        <DailyGoalField
          value={values.dailyGoalMinutes}
          onChange={set("dailyGoalMinutes")}
          error={clientErrors.dailyGoalMinutes}
        />
      </div>
      <input type="hidden" name="timezone" value={deviceTimeZone ?? values.timezone} />

      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={pending}>
            <ArrowLeft aria-hidden />
            Back
          </Button>
        ) : (
          <span />
        )}
        {/* Distinct keys make React swap the DOM button. Reusing it would flip the clicked
            Continue button to type="submit" mid-click, and the browser would then submit the form. */}
        {step < LAST ? (
          <Button key="continue" type="button" onClick={next}>
            Continue
            <ArrowRight aria-hidden />
          </Button>
        ) : (
          <Button key="finish" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Finish setup"}
          </Button>
        )}
      </div>
    </form>
  );
}
