import type { Profile } from "@/lib/auth/dal";
import type { EnglishLevel, LearningContext } from "@/lib/validation/profile";

/** Controlled form values shared by the onboarding wizard and Settings. */
export type ProfileValues = {
  displayName: string;
  nativeLanguage: string;
  englishLevel: EnglishLevel | "";
  learningGoal: string;
  contexts: LearningContext[];
  dailyGoalMinutes: number;
  timezone: string;
};

export type ProfileFieldErrors = Partial<Record<keyof ProfileValues, string>>;

/** Form values from a stored profile (or defaults matching the profiles table). */
export function profileToValues(profile: Profile | null): ProfileValues {
  return {
    displayName: profile?.displayName ?? "",
    nativeLanguage: profile?.nativeLanguage ?? "",
    englishLevel: profile?.englishLevel ?? "",
    learningGoal: profile?.learningGoal ?? "",
    contexts: profile?.contexts ?? [],
    dailyGoalMinutes: profile?.dailyGoalMinutes ?? 20,
    timezone: profile?.timezone ?? "UTC",
  };
}
