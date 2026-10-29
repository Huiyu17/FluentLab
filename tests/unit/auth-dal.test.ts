import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const {
  getAuthState,
  getCurrentProfile,
  getCurrentUser,
  requireAppAccess,
  requireOnboardedUser,
  requireOnboardingPending,
  requireUser,
} = await import("@/lib/auth/dal");

const USER_ID = "8f6d2c1e-4b3a-4f5e-9a7b-1c2d3e4f5a6b";

const profileRow = {
  id: USER_ID,
  display_name: "Ana",
  native_language: "Spanish",
  english_level: "advanced",
  learning_goal: null,
  contexts: ["campus"],
  daily_goal_minutes: 20,
  timezone: "UTC",
  onboarded_at: "2026-10-28T10:00:00Z",
};

type FakeOptions = {
  claims?: Record<string, unknown> | null;
  claimsError?: boolean;
  profile?: Record<string, unknown> | null;
  profileError?: string;
};

function fakeSupabase({ claims = null, claimsError = false, profile = null, profileError }: FakeOptions) {
  const eq = vi.fn(() => ({
    maybeSingle: async () =>
      profileError ? { data: null, error: { message: profileError } } : { data: profile, error: null },
  }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    client: {
      auth: {
        getClaims: async () =>
          claimsError || !claims
            ? { data: null, error: { message: "Auth session missing!" } }
            : { data: { claims }, error: null },
      },
      from,
    },
    from,
    eq,
  };
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

beforeEach(() => createClient.mockReset());

describe("getAuthState", () => {
  it("is unconfigured when Supabase env vars are missing", async () => {
    createClient.mockResolvedValue(null);
    expect(await getAuthState()).toEqual({ status: "unconfigured" });
    expect(await getCurrentUser()).toBeNull();
  });

  it("is signed out when there is no valid session", async () => {
    createClient.mockResolvedValue(fakeSupabase({ claimsError: true }).client);
    expect(await getAuthState()).toEqual({ status: "signed_out" });
  });

  it("returns a narrow user from verified claims", async () => {
    createClient.mockResolvedValue(
      fakeSupabase({ claims: { sub: USER_ID, email: "ana@example.com", role: "authenticated" } }).client,
    );
    expect(await getCurrentUser()).toEqual({ id: USER_ID, email: "ana@example.com" });
  });

  it("treats claims without a subject as signed out", async () => {
    createClient.mockResolvedValue(fakeSupabase({ claims: { role: "anon" } }).client);
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("getCurrentProfile", () => {
  it("does not query the database when signed out", async () => {
    const fake = fakeSupabase({});
    createClient.mockResolvedValue(fake.client);
    expect(await getCurrentProfile()).toBeNull();
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("loads the signed-in user's own row and maps it to camelCase", async () => {
    const fake = fakeSupabase({ claims: { sub: USER_ID }, profile: profileRow });
    createClient.mockResolvedValue(fake.client);
    expect(await getCurrentProfile()).toEqual({
      id: USER_ID,
      displayName: "Ana",
      nativeLanguage: "Spanish",
      englishLevel: "advanced",
      learningGoal: null,
      contexts: ["campus"],
      dailyGoalMinutes: 20,
      timezone: "UTC",
      onboardedAt: "2026-10-28T10:00:00Z",
    });
    expect(fake.from).toHaveBeenCalledWith("profiles");
    expect(fake.eq).toHaveBeenCalledWith("id", USER_ID);
  });

  it("returns null when the profile row is missing", async () => {
    createClient.mockResolvedValue(fakeSupabase({ claims: { sub: USER_ID }, profile: null }).client);
    expect(await getCurrentProfile()).toBeNull();
  });

  it("throws on database errors instead of treating them as not onboarded", async () => {
    createClient.mockResolvedValue(
      fakeSupabase({ claims: { sub: USER_ID }, profileError: "permission denied" }).client,
    );
    await expect(getCurrentProfile()).rejects.toThrow("Could not load profile: permission denied");
  });

  it("rejects rows that do not match the expected shape", async () => {
    createClient.mockResolvedValue(
      fakeSupabase({ claims: { sub: USER_ID }, profile: { ...profileRow, english_level: "C1" } }).client,
    );
    await expect(getCurrentProfile()).rejects.toThrow();
  });
});

describe("requireUser", () => {
  it("returns the user when signed in", async () => {
    createClient.mockResolvedValue(fakeSupabase({ claims: { sub: USER_ID } }).client);
    expect(await requireUser()).toEqual({ id: USER_ID, email: null });
  });

  it("redirects to /login when signed out", async () => {
    createClient.mockResolvedValue(fakeSupabase({}).client);
    expect(await redirectTarget(requireUser())).toBe("/login");
  });

  it("redirects to /login in unconfigured mode", async () => {
    createClient.mockResolvedValue(null);
    expect(await redirectTarget(requireUser())).toBe("/login");
  });

  it("passes a safe return path", async () => {
    createClient.mockResolvedValue(fakeSupabase({}).client);
    expect(await redirectTarget(requireUser("/gaps?tab=open"))).toBe("/login?next=%2Fgaps%3Ftab%3Dopen");
    expect(await redirectTarget(requireUser("//evil.example"))).toBe("/login?next=%2Ftoday");
  });
});

describe("requireOnboardedUser", () => {
  it("returns user and profile once onboarded", async () => {
    createClient.mockResolvedValue(fakeSupabase({ claims: { sub: USER_ID }, profile: profileRow }).client);
    const { user, profile } = await requireOnboardedUser();
    expect(user.id).toBe(USER_ID);
    expect(profile.onboardedAt).toBe("2026-10-28T10:00:00Z");
  });

  it("redirects to /onboarding when onboarding is not finished", async () => {
    createClient.mockResolvedValue(
      fakeSupabase({ claims: { sub: USER_ID }, profile: { ...profileRow, onboarded_at: null } }).client,
    );
    expect(await redirectTarget(requireOnboardedUser())).toBe("/onboarding");
  });

  it("redirects to /onboarding when the profile row is missing", async () => {
    createClient.mockResolvedValue(fakeSupabase({ claims: { sub: USER_ID }, profile: null }).client);
    expect(await redirectTarget(requireOnboardedUser())).toBe("/onboarding");
  });

  it("redirects to /login before reading the profile when signed out", async () => {
    const fake = fakeSupabase({});
    createClient.mockResolvedValue(fake.client);
    expect(await redirectTarget(requireOnboardedUser())).toBe("/login");
    expect(fake.from).not.toHaveBeenCalled();
  });
});

describe("requireAppAccess (app layout gate)", () => {
  it("lets the shell render in unconfigured mode", async () => {
    createClient.mockResolvedValue(null);
    await expect(requireAppAccess()).resolves.toBeUndefined();
  });

  it("allows onboarded users", async () => {
    createClient.mockResolvedValue(fakeSupabase({ claims: { sub: USER_ID }, profile: profileRow }).client);
    await expect(requireAppAccess()).resolves.toBeUndefined();
  });

  it("redirects signed-out users to /login and new users to /onboarding", async () => {
    createClient.mockResolvedValue(fakeSupabase({}).client);
    expect(await redirectTarget(requireAppAccess())).toBe("/login");
    createClient.mockResolvedValue(
      fakeSupabase({ claims: { sub: USER_ID }, profile: { ...profileRow, onboarded_at: null } }).client,
    );
    expect(await redirectTarget(requireAppAccess())).toBe("/onboarding");
  });
});

describe("requireOnboardingPending (/onboarding gate)", () => {
  it("returns null in unconfigured mode", async () => {
    createClient.mockResolvedValue(null);
    expect(await requireOnboardingPending()).toBeNull();
  });

  it("redirects signed-out users to /login and back to /onboarding", async () => {
    createClient.mockResolvedValue(fakeSupabase({}).client);
    expect(await redirectTarget(requireOnboardingPending())).toBe("/login?next=%2Fonboarding");
  });

  it("sends onboarded users to /today", async () => {
    createClient.mockResolvedValue(fakeSupabase({ claims: { sub: USER_ID }, profile: profileRow }).client);
    expect(await redirectTarget(requireOnboardingPending())).toBe("/today");
  });

  it("returns the user and profile while onboarding is pending", async () => {
    createClient.mockResolvedValue(
      fakeSupabase({ claims: { sub: USER_ID }, profile: { ...profileRow, onboarded_at: null } }).client,
    );
    const result = await requireOnboardingPending();
    expect(result?.user.id).toBe(USER_ID);
    expect(result?.profile?.onboardedAt).toBeNull();
  });
});
