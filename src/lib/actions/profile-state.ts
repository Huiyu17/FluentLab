import type { ProfileInput } from "@/lib/validation/profile";

export type ProfileField = keyof ProfileInput;

/** State returned by the profile Server Actions to `useActionState`. */
export type ProfileFormState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: Partial<Record<ProfileField, string>> }
  | { status: "saved"; savedAt: number };

export const IDLE_PROFILE_STATE: ProfileFormState = { status: "idle" };
