"use client";

import { Check } from "lucide-react";
import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
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
import { updateProfile } from "@/lib/actions/profile";
import { IDLE_PROFILE_STATE } from "@/lib/actions/profile-state";
import { ProfileSchema } from "@/lib/validation/profile";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border bg-card p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const [state, action, pending] = useActionState(updateProfile, IDLE_PROFILE_STATE);
  const [values, setValues] = useState<ProfileValues>(initial);
  const [clientErrors, setClientErrors] = useState<ProfileFieldErrors>({});
  const [dirty, setDirty] = useState(false);
  const [shownState, setShownState] = useState(state);
  const deviceTimeZone = useDeviceTimeZone();

  if (state !== shownState) {
    setShownState(state);
    if (state.status === "error" && state.fieldErrors) setClientErrors(state.fieldErrors);
    if (state.status === "saved") setDirty(false);
  }

  const set =
    <K extends keyof ProfileValues>(field: K) =>
    (value: ProfileValues[K]) => {
      setValues((v) => ({ ...v, [field]: value }));
      setClientErrors((errors) => ({ ...errors, [field]: undefined }));
      setDirty(true);
    };

  // Submitted by hand rather than via <form action>: React resets a form after its action,
  // which puts radios and checkboxes back to their first-render state and hides the saved values.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = ProfileSchema.safeParse(values);
    if (!result.success) {
      const flat = z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
      setClientErrors(Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v?.[0]])));
      return;
    }
    const formData = new FormData(event.currentTarget);
    startTransition(() => action(formData));
  }

  const formError = state.status === "error" ? state.message : undefined;
  const hasFieldErrors = Object.values(clientErrors).some(Boolean);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Section
        title="About you"
        description="How FluentLab addresses you and what it knows about your background."
      >
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
        <EnglishLevelField
          value={values.englishLevel}
          onChange={set("englishLevel")}
          error={clientErrors.englishLevel}
        />
      </Section>

      <Section title="Your goals" description="Used to pick scenarios and recommendations for you.">
        <ContextsField value={values.contexts} onChange={set("contexts")} error={clientErrors.contexts} />
        <LearningGoalField
          value={values.learningGoal}
          onChange={set("learningGoal")}
          error={clientErrors.learningGoal}
        />
      </Section>

      <Section
        title="Daily practice"
        description="Your daily target and the time zone your days are counted in."
      >
        <DailyGoalField
          value={values.dailyGoalMinutes}
          onChange={set("dailyGoalMinutes")}
          error={clientErrors.dailyGoalMinutes}
        />
        <div className="flex flex-col gap-2 text-sm">
          <p>
            <span className="font-medium">Time zone:</span> {values.timezone}
          </p>
          {deviceTimeZone && deviceTimeZone !== values.timezone && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => set("timezone")(deviceTimeZone)}
            >
              Use this device&apos;s time zone ({deviceTimeZone})
            </Button>
          )}
        </div>
        <input type="hidden" name="timezone" value={values.timezone} />
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <div aria-live="polite" className="text-sm">
          {state.status === "saved" && !dirty && (
            <span className="flex items-center gap-1.5 text-primary">
              <Check aria-hidden className="size-4" />
              Saved
            </span>
          )}
          {hasFieldErrors && <span className="text-destructive">Please fix the highlighted fields.</span>}
        </div>
      </div>
      {formError && (
        <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2.5 text-sm">
          {formError}
        </p>
      )}
    </form>
  );
}
