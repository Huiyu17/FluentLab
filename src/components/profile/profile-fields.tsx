"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { FormField } from "@/components/shared/form-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  COMMON_NATIVE_LANGUAGES,
  DAILY_GOAL_OPTIONS,
  ENGLISH_LEVELS,
  ENGLISH_LEVEL_LABELS,
  LEARNING_CONTEXTS,
  LEARNING_CONTEXT_LABELS,
  type EnglishLevel,
  type LearningContext,
} from "@/lib/validation/profile";

/** The browser's IANA time zone; null during server rendering. */
export function useDeviceTimeZone(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {error}
    </p>
  );
}

/** Group of radio/checkbox options with a legend and an accessible error. */
function ChoiceGroup({
  name,
  legend,
  description,
  error,
  children,
}: {
  name: string;
  legend: string;
  description?: string;
  error?: string;
  children: ReactNode;
}) {
  const descriptionId = description ? `${name}-description` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset
      className="flex flex-col gap-3"
      aria-describedby={[descriptionId, errorId].filter(Boolean).join(" ") || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="mb-3 text-sm font-medium">{legend}</legend>
      {description && (
        <p id={descriptionId} className="-mt-3 text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {children}
      {errorId && <FieldError id={errorId} error={error} />}
    </fieldset>
  );
}

// The native input stays in the DOM (visually hidden) so keyboard, screen readers and
// FormData all work; the label shows the checked and focus states.
const choiceLabel =
  "cursor-pointer border bg-card transition-colors hover:bg-accent has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2";

export function DisplayNameField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <FormField
      id="displayName"
      name="displayName"
      label="What should we call you?"
      autoComplete="nickname"
      maxLength={80}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
    />
  );
}

export function NativeLanguageField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <>
      <FormField
        id="nativeLanguage"
        name="nativeLanguage"
        label="Your native language"
        hint="Pick from the list or type your own."
        list="native-language-options"
        autoComplete="off"
        maxLength={60}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
      />
      <datalist id="native-language-options">
        {COMMON_NATIVE_LANGUAGES.map((language) => (
          <option key={language} value={language} />
        ))}
      </datalist>
    </>
  );
}

export function EnglishLevelField({
  value,
  onChange,
  error,
}: {
  value: EnglishLevel | "";
  onChange: (value: EnglishLevel) => void;
  error?: string;
}) {
  return (
    <ChoiceGroup
      name="englishLevel"
      legend="How comfortable are you in English?"
      description="Your own estimate. It only tunes how conversations are pitched."
      error={error}
    >
      {ENGLISH_LEVELS.map((level) => (
        <label key={level} className={cn(choiceLabel, "flex flex-col gap-1 rounded-xl px-4 py-3")}>
          <input
            type="radio"
            name="englishLevel"
            value={level}
            checked={value === level}
            onChange={() => onChange(level)}
            className="sr-only"
          />
          <span className="font-medium">{ENGLISH_LEVEL_LABELS[level].label}</span>
          <span className="text-sm text-muted-foreground">{ENGLISH_LEVEL_LABELS[level].hint}</span>
        </label>
      ))}
    </ChoiceGroup>
  );
}

export function ContextsField({
  value,
  onChange,
  error,
}: {
  value: LearningContext[];
  onChange: (value: LearningContext[]) => void;
  error?: string;
}) {
  const toggle = (context: LearningContext, checked: boolean) =>
    onChange(checked ? [...value, context] : value.filter((c) => c !== context));

  return (
    <ChoiceGroup
      name="contexts"
      legend="Where do you use English?"
      description="Pick all that apply. We'll suggest scenarios from these."
      error={error}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {LEARNING_CONTEXTS.map((context) => (
          <label key={context} className={cn(choiceLabel, "flex flex-col gap-0.5 rounded-xl px-4 py-3")}>
            <input
              type="checkbox"
              name="contexts"
              value={context}
              checked={value.includes(context)}
              onChange={(e) => toggle(context, e.target.checked)}
              className="sr-only"
            />
            <span className="font-medium">{LEARNING_CONTEXT_LABELS[context].label}</span>
            <span className="text-sm text-muted-foreground">{LEARNING_CONTEXT_LABELS[context].hint}</span>
          </label>
        ))}
      </div>
    </ChoiceGroup>
  );
}

export function LearningGoalField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = error ? "learningGoal-error" : undefined;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="learningGoal">
        What do you want to get better at?{" "}
        <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      <Textarea
        id="learningGoal"
        name="learningGoal"
        rows={3}
        maxLength={500}
        placeholder="e.g. I'm studying in the US and want to speak up more in class and sound natural at office hours."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
      />
      {errorId && <FieldError id={errorId} error={error} />}
    </div>
  );
}

export function DailyGoalField({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (value: number) => void;
  error?: string;
}) {
  // Keep a saved value selectable even if it isn't one of the presets.
  const options = (DAILY_GOAL_OPTIONS as readonly number[]).includes(value)
    ? DAILY_GOAL_OPTIONS
    : [...DAILY_GOAL_OPTIONS, value].sort((a, b) => a - b);

  return (
    <ChoiceGroup
      name="dailyGoalMinutes"
      legend="How much time a day?"
      description="A small, steady goal works better than a big one. You can change it any time."
      error={error}
    >
      <div className="flex flex-wrap gap-2">
        {options.map((minutes) => (
          <label key={minutes} className={cn(choiceLabel, "rounded-full px-4 py-2 text-sm font-medium")}>
            <input
              type="radio"
              name="dailyGoalMinutes"
              value={minutes}
              checked={value === minutes}
              onChange={() => onChange(minutes)}
              className="sr-only"
            />
            {minutes} min
          </label>
        ))}
      </div>
    </ChoiceGroup>
  );
}
