import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_PROFILE_STATE } from "@/lib/actions/profile-state";

class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));

const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh: () => refresh() }));

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";
const requireUser = vi.fn();
vi.mock("@/lib/auth/dal", () => ({ requireUser: (next?: string) => requireUser(next) }));

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { completeOnboarding, updateProfile } = await import("@/lib/actions/profile");

function fakeSupabase(result: { data: unknown; error: unknown }) {
  const select = vi.fn(async () => result);
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn<(row: Record<string, unknown>) => { eq: typeof eq }>(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { client: { from }, from, update, eq };
}

function form(overrides: Record<string, string | string[]> = {}) {
  const values: Record<string, string | string[]> = {
    displayName: "Ana",
    nativeLanguage: "Spanish",
    englishLevel: "upper_intermediate",
    learningGoal: "Sound natural at office hours",
    contexts: ["campus", "career"],
    dailyGoalMinutes: "20",
    timezone: "America/New_York",
    ...overrides,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
}

async function redirectTarget(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RedirectError) return error.url;
    throw error;
  }
  throw new Error("Expected a redirect");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  refresh.mockReset();
  requireUser.mockReset().mockResolvedValue({ id: USER_ID, email: "ana@example.com" });
  createClient.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("completeOnboarding", () => {
  it("saves the profile, marks onboarding done and goes to /today", async () => {
    const fake = fakeSupabase({ data: [{ id: USER_ID }], error: null });
    createClient.mockResolvedValue(fake.client);

    expect(await redirectTarget(completeOnboarding(IDLE_PROFILE_STATE, form()))).toBe("/today");

    expect(fake.from).toHaveBeenCalledWith("profiles");
    expect(fake.eq).toHaveBeenCalledWith("id", USER_ID);
    const row = fake.update.mock.calls[0]?.[0];
    expect(row).toMatchObject({
      display_name: "Ana",
      native_language: "Spanish",
      english_level: "upper_intermediate",
      learning_goal: "Sound natural at office hours",
      contexts: ["campus", "career"],
      daily_goal_minutes: 20,
      timezone: "America/New_York",
    });
    expect(Date.parse(String(row?.onboarded_at))).not.toBeNaN();
  });

  it("returns field errors without touching the database", async () => {
    const state = await completeOnboarding(IDLE_PROFILE_STATE, form({ contexts: [], englishLevel: "C1" }));
    expect(state).toEqual({
      status: "error",
      fieldErrors: {
        englishLevel: "Choose the level that fits best.",
        contexts: "Pick at least one place you use English.",
      },
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("checks the session before anything else", async () => {
    requireUser.mockRejectedValue(new RedirectError("/login?next=%2Fonboarding"));
    expect(await redirectTarget(completeOnboarding(IDLE_PROFILE_STATE, form()))).toBe(
      "/login?next=%2Fonboarding",
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reports a missing profile row instead of pretending to succeed", async () => {
    createClient.mockResolvedValue(fakeSupabase({ data: [], error: null }).client);
    expect(await completeOnboarding(IDLE_PROFILE_STATE, form())).toEqual({
      status: "error",
      message: "We couldn't save your profile. Please try again.",
    });
  });

  it("reports database errors", async () => {
    createClient.mockResolvedValue(fakeSupabase({ data: null, error: { code: "23514" } }).client);
    expect(await completeOnboarding(IDLE_PROFILE_STATE, form())).toMatchObject({ status: "error" });
  });
});

describe("updateProfile", () => {
  it("saves without touching onboarded_at and refreshes the page", async () => {
    const fake = fakeSupabase({ data: [{ id: USER_ID }], error: null });
    createClient.mockResolvedValue(fake.client);

    const state = await updateProfile(
      IDLE_PROFILE_STATE,
      form({ dailyGoalMinutes: "45", learningGoal: "  " }),
    );

    expect(state).toMatchObject({ status: "saved" });
    const row = fake.update.mock.calls[0]?.[0];
    expect(row).not.toHaveProperty("onboarded_at");
    expect(row).toMatchObject({ daily_goal_minutes: 45, learning_goal: null });
    expect(refresh).toHaveBeenCalled();
  });

  it("falls back to UTC for an unknown time zone", async () => {
    const fake = fakeSupabase({ data: [{ id: USER_ID }], error: null });
    createClient.mockResolvedValue(fake.client);
    await updateProfile(IDLE_PROFILE_STATE, form({ timezone: "Mars/Base" }));
    expect(fake.update.mock.calls[0]?.[0]).toMatchObject({ timezone: "UTC" });
  });

  it("explains when Supabase is not configured", async () => {
    createClient.mockResolvedValue(null);
    expect(await updateProfile(IDLE_PROFILE_STATE, form())).toMatchObject({ status: "error" });
  });
});
