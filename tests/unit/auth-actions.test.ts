import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_AUTH_STATE } from "@/lib/actions/auth-state";

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

const { sendMagicLink, signIn, signOut, signUp } = await import("@/lib/actions/auth");

const auth = {
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
};

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function authError(code: string, status: number) {
  return { code, status, message: code, name: "AuthApiError" };
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
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://fluentlab.example");
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const fn of Object.values(auth)) fn.mockReset();
  createClient.mockReset().mockResolvedValue({ auth });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("signUp", () => {
  const valid = { displayName: " Ana ", email: "Ana@Example.com", password: "correct horse" };

  it("returns field errors without calling Supabase", async () => {
    const state = await signUp(IDLE_AUTH_STATE, form({ displayName: "", email: "x", password: "123" }));
    expect(state).toEqual({
      status: "error",
      fieldErrors: {
        displayName: "Tell us what to call you.",
        email: "Enter a valid email address.",
        password: "Use at least 8 characters.",
      },
    });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("sends normalized values, the display name and a callback to onboarding", async () => {
    auth.signUp.mockResolvedValue({ data: { user: {}, session: null }, error: null });
    const state = await signUp(IDLE_AUTH_STATE, form(valid));
    expect(state).toEqual({ status: "check_email", email: "ana@example.com" });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "correct horse",
      options: {
        data: { display_name: "Ana" },
        emailRedirectTo: "https://fluentlab.example/auth/callback?next=%2Fonboarding",
      },
    });
  });

  it("goes straight to onboarding when email confirmation is off", async () => {
    auth.signUp.mockResolvedValue({ data: { user: {}, session: {} }, error: null });
    expect(await redirectTarget(signUp(IDLE_AUTH_STATE, form(valid)))).toBe("/onboarding");
  });

  it("maps rate limits and unknown errors to friendly messages", async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: authError("over_email_send_rate_limit", 429) });
    expect(await signUp(IDLE_AUTH_STATE, form(valid))).toMatchObject({
      message: "Too many attempts. Please wait a minute and try again.",
    });
    auth.signUp.mockResolvedValue({ data: {}, error: authError("unexpected_failure", 500) });
    expect(await signUp(IDLE_AUTH_STATE, form(valid))).toMatchObject({
      message: "We couldn't create your account. Please try again.",
    });
  });

  it("never echoes the password back in the state", async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: authError("unexpected_failure", 500) });
    const state = await signUp(IDLE_AUTH_STATE, form(valid));
    expect(JSON.stringify(state)).not.toContain("correct horse");
  });

  it("explains when Supabase is not configured", async () => {
    createClient.mockResolvedValue(null);
    expect(await signUp(IDLE_AUTH_STATE, form(valid))).toMatchObject({ status: "error" });
  });
});

describe("signIn", () => {
  const valid = { email: "ana@example.com", password: "correct horse" };

  it("redirects to a safe next path on success", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    expect(await redirectTarget(signIn(IDLE_AUTH_STATE, form({ ...valid, next: "/gaps" })))).toBe("/gaps");
    expect(
      await redirectTarget(signIn(IDLE_AUTH_STATE, form({ ...valid, next: "https://evil.example" }))),
    ).toBe("/today");
  });

  it("does not reveal whether the email exists on wrong credentials", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: authError("invalid_credentials", 400) });
    expect(await signIn(IDLE_AUTH_STATE, form(valid))).toEqual({
      status: "error",
      message: "That email and password don't match. Please try again.",
    });
  });

  it("asks unconfirmed users to confirm their email", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: authError("email_not_confirmed", 400) });
    expect(await signIn(IDLE_AUTH_STATE, form(valid))).toMatchObject({
      message: expect.stringContaining("Confirm your email"),
    });
  });
});

describe("sendMagicLink", () => {
  it("only signs in existing users and returns to the requested page", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const state = await sendMagicLink(
      IDLE_AUTH_STATE,
      form({ email: "ana@example.com", next: "/my-english" }),
    );
    expect(state).toEqual({ status: "check_email", email: "ana@example.com" });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "ana@example.com",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "https://fluentlab.example/auth/callback?next=%2Fmy-english",
      },
    });
  });

  it("answers the same way for unknown emails", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: authError("otp_disabled", 422) });
    expect(await sendMagicLink(IDLE_AUTH_STATE, form({ email: "nobody@example.com" }))).toEqual({
      status: "check_email",
      email: "nobody@example.com",
    });
  });

  it("reports server failures and rate limits", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: authError("unexpected_failure", 500) });
    expect(await sendMagicLink(IDLE_AUTH_STATE, form({ email: "ana@example.com" }))).toMatchObject({
      status: "error",
    });
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: authError("over_email_send_rate_limit", 429) });
    expect(await sendMagicLink(IDLE_AUTH_STATE, form({ email: "ana@example.com" }))).toMatchObject({
      message: "Too many attempts. Please wait a minute and try again.",
    });
  });
});

describe("signOut", () => {
  it("signs out and redirects to /login", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    expect(await redirectTarget(signOut())).toBe("/login");
    expect(auth.signOut).toHaveBeenCalled();
  });
});
