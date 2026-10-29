import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

const { GET } = await import("@/app/auth/callback/route");

const auth = { verifyOtp: vi.fn(), exchangeCodeForSession: vi.fn() };

async function callback(query: string): Promise<string | null> {
  const response = await GET(new NextRequest(`http://localhost:3000/auth/callback?${query}`));
  expect(response.status).toBe(307);
  return response.headers.get("location");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  auth.verifyOtp.mockReset().mockResolvedValue({ data: {}, error: null });
  auth.exchangeCodeForSession.mockReset().mockResolvedValue({ data: {}, error: null });
  createClient.mockReset().mockResolvedValue({ auth });
});

describe("GET /auth/callback", () => {
  it("verifies a token_hash link and goes to next", async () => {
    expect(await callback("token_hash=abc&type=signup&next=%2Fonboarding")).toBe(
      "http://localhost:3000/onboarding",
    );
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "signup" });
  });

  it("exchanges a PKCE code", async () => {
    expect(await callback("code=xyz")).toBe("http://localhost:3000/today");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("xyz");
  });

  it("never redirects off-site", async () => {
    expect(await callback("code=xyz&next=%2F%2Fevil.example")).toBe("http://localhost:3000/today");
    expect(await callback("code=xyz&next=https%3A%2F%2Fevil.example")).toBe("http://localhost:3000/today");
  });

  it("rejects unknown OTP types without calling Supabase", async () => {
    expect(await callback("token_hash=abc&type=sms")).toBe("http://localhost:3000/login?error=link_invalid");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("sends expired or failed links back to /login", async () => {
    expect(await callback("error=access_denied&error_code=otp_expired")).toBe(
      "http://localhost:3000/login?error=link_invalid",
    );
    auth.verifyOtp.mockResolvedValue({ data: {}, error: { code: "otp_expired", status: 403 } });
    expect(await callback("token_hash=abc&type=magiclink")).toBe(
      "http://localhost:3000/login?error=link_invalid",
    );
  });

  it("handles a missing token and unconfigured mode", async () => {
    expect(await callback("")).toBe("http://localhost:3000/login?error=link_invalid");
    createClient.mockResolvedValue(null);
    expect(await callback("code=xyz")).toBe("http://localhost:3000/login?error=unconfigured");
  });
});
