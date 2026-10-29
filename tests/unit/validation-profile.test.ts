import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DAILY_GOAL_OPTIONS,
  ENGLISH_LEVELS,
  LEARNING_CONTEXTS,
  ProfileSchema,
  TimeZoneSchema,
  profileFormValues,
  toProfileRow,
} from "@/lib/validation/profile";

const valid = {
  displayName: "Ana",
  nativeLanguage: "Spanish",
  englishLevel: "upper_intermediate",
  learningGoal: "Sound natural at office hours",
  contexts: ["campus", "career"],
  dailyGoalMinutes: 20,
  timezone: "America/New_York",
};

function firstMessage(input: unknown) {
  const result = ProfileSchema.safeParse(input);
  return result.success ? null : result.error.issues[0]?.message;
}

describe("ProfileSchema", () => {
  it("accepts a complete profile", () => {
    expect(ProfileSchema.parse(valid)).toEqual(valid);
  });

  it("trims text and stores a blank learning goal as null", () => {
    const parsed = ProfileSchema.parse({
      ...valid,
      displayName: "  Ana ",
      nativeLanguage: " Spanish ",
      learningGoal: "   ",
    });
    expect(parsed.displayName).toBe("Ana");
    expect(parsed.nativeLanguage).toBe("Spanish");
    expect(parsed.learningGoal).toBeNull();
  });

  it("enforces the same length limits as the profiles table", () => {
    expect(firstMessage({ ...valid, displayName: "a".repeat(81) })).toBe("Use 80 characters or fewer.");
    expect(firstMessage({ ...valid, nativeLanguage: "a".repeat(61) })).toBe("Use 60 characters or fewer.");
    expect(firstMessage({ ...valid, learningGoal: "a".repeat(501) })).toBe("Use 500 characters or fewer.");
  });

  it("requires a display name and native language", () => {
    expect(firstMessage({ ...valid, displayName: " " })).toBe("Tell us what to call you.");
    expect(firstMessage({ ...valid, nativeLanguage: "" })).toBe("Choose or type your native language.");
  });

  it("rejects unknown English levels", () => {
    expect(firstMessage({ ...valid, englishLevel: "C1" })).toBe("Choose the level that fits best.");
    expect(firstMessage({ ...valid, englishLevel: undefined })).toBe("Choose the level that fits best.");
  });

  it("requires at least one known context and removes duplicates", () => {
    expect(firstMessage({ ...valid, contexts: [] })).toBe("Pick at least one place you use English.");
    expect(ProfileSchema.safeParse({ ...valid, contexts: ["campus", "dating"] }).success).toBe(false);
    expect(ProfileSchema.parse({ ...valid, contexts: ["social", "social", "travel"] }).contexts).toEqual([
      "social",
      "travel",
    ]);
  });

  it("coerces daily minutes from form strings and keeps them within 5–120", () => {
    expect(ProfileSchema.parse({ ...valid, dailyGoalMinutes: "30" }).dailyGoalMinutes).toBe(30);
    expect(firstMessage({ ...valid, dailyGoalMinutes: "4" })).toBe("Choose between 5 and 120 minutes.");
    expect(firstMessage({ ...valid, dailyGoalMinutes: "121" })).toBe("Choose between 5 and 120 minutes.");
    expect(firstMessage({ ...valid, dailyGoalMinutes: undefined })).toBe("Choose a daily goal.");
    expect(ProfileSchema.safeParse({ ...valid, dailyGoalMinutes: "12.5" }).success).toBe(false);
  });

  it("offers only daily goal options the schema accepts", () => {
    for (const minutes of DAILY_GOAL_OPTIONS) {
      expect(ProfileSchema.safeParse({ ...valid, dailyGoalMinutes: minutes }).success).toBe(true);
    }
  });
});

describe("TimeZoneSchema", () => {
  it("keeps valid IANA time zones", () => {
    expect(TimeZoneSchema.parse("Asia/Shanghai")).toBe("Asia/Shanghai");
  });

  it("falls back to UTC for unknown, overlong or missing values", () => {
    expect(TimeZoneSchema.parse("Mars/Olympus_Mons")).toBe("UTC");
    expect(TimeZoneSchema.parse("A".repeat(65))).toBe("UTC");
    expect(TimeZoneSchema.parse(undefined)).toBe("UTC");
  });
});

describe("profileFormValues + toProfileRow", () => {
  it("turns a submitted form into a profiles row", () => {
    const form = new FormData();
    form.set("displayName", "Ana");
    form.set("nativeLanguage", "Spanish");
    form.set("englishLevel", "advanced");
    form.set("learningGoal", "");
    form.append("contexts", "campus");
    form.append("contexts", "social");
    form.set("dailyGoalMinutes", "15");
    form.set("timezone", "Europe/London");

    const row = toProfileRow(ProfileSchema.parse(profileFormValues(form)));
    expect(row).toEqual({
      display_name: "Ana",
      native_language: "Spanish",
      english_level: "advanced",
      learning_goal: null,
      contexts: ["campus", "social"],
      daily_goal_minutes: 15,
      timezone: "Europe/London",
    });
  });

  it("reports missing fields instead of throwing on an empty form", () => {
    const result = ProfileSchema.safeParse(profileFormValues(new FormData()));
    expect(result.success).toBe(false);
  });
});

describe("constants mirror the profiles table checks", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261028000100_foundation.sql"), "utf8");
  const quoted = (fragment: string) => [...fragment.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();

  it("english_level", () => {
    const check = sql.match(/english_level in \(([^)]*)\)/)?.[1] ?? "";
    expect(quoted(check)).toEqual([...ENGLISH_LEVELS].sort());
  });

  it("contexts", () => {
    const check = sql.match(/contexts <@ array\[([^\]]*)\]/)?.[1] ?? "";
    expect(quoted(check)).toEqual([...LEARNING_CONTEXTS].sort());
  });
});
