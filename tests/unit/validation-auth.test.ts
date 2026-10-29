import { describe, expect, it } from "vitest";
import {
  EmailOtpTypeSchema,
  EmailSchema,
  MagicLinkSchema,
  SignInSchema,
  SignUpSchema,
} from "@/lib/validation/auth";

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((i) => i.message) ?? [];
}

describe("EmailSchema", () => {
  it("trims and lowercases", () => {
    expect(EmailSchema.parse("  Ana@Example.COM ")).toBe("ana@example.com");
  });

  it("asks for an email when missing or blank", () => {
    expect(messages(EmailSchema.safeParse(undefined))).toEqual(["Enter your email."]);
    expect(messages(EmailSchema.safeParse("   "))).toEqual(["Enter your email."]);
  });

  it("rejects malformed addresses", () => {
    expect(messages(EmailSchema.safeParse("not-an-email"))).toEqual(["Enter a valid email address."]);
  });

  it("rejects addresses over 254 characters", () => {
    const email = `${"a".repeat(243)}@example.com`; // 255 chars
    expect(messages(EmailSchema.safeParse(email))).toEqual(["That email is too long."]);
  });
});

describe("SignUpSchema", () => {
  const valid = { displayName: " Ana ", email: "ana@example.com", password: "correct horse" };

  it("accepts valid input and trims the display name", () => {
    expect(SignUpSchema.parse(valid)).toEqual({ ...valid, displayName: "Ana" });
  });

  it("requires a non-blank display name of at most 80 characters", () => {
    expect(messages(SignUpSchema.safeParse({ ...valid, displayName: "   " }))).toEqual([
      "Tell us what to call you.",
    ]);
    expect(SignUpSchema.safeParse({ ...valid, displayName: "a".repeat(81) }).success).toBe(false);
  });

  it("requires passwords of at least 8 characters", () => {
    expect(messages(SignUpSchema.safeParse({ ...valid, password: "1234567" }))).toEqual([
      "Use at least 8 characters.",
    ]);
  });

  it("limits passwords to 72 bytes, not 72 characters", () => {
    expect(SignUpSchema.safeParse({ ...valid, password: "a".repeat(72) }).success).toBe(true);
    expect(SignUpSchema.safeParse({ ...valid, password: "a".repeat(73) }).success).toBe(false);
    // 30 CJK characters = 90 UTF-8 bytes: within 72 chars, over bcrypt's 72-byte limit.
    expect(SignUpSchema.safeParse({ ...valid, password: "密".repeat(30) }).success).toBe(false);
  });
});

describe("SignInSchema", () => {
  it("asks for a password when empty", () => {
    expect(messages(SignInSchema.safeParse({ email: "ana@example.com", password: "" }))).toEqual([
      "Enter your password.",
    ]);
  });

  it("does not apply the sign-up minimum length", () => {
    expect(SignInSchema.safeParse({ email: "ana@example.com", password: "short" }).success).toBe(true);
  });
});

describe("MagicLinkSchema", () => {
  it("normalizes the email", () => {
    expect(MagicLinkSchema.parse({ email: " Ana@Example.com" })).toEqual({ email: "ana@example.com" });
  });
});

describe("EmailOtpTypeSchema", () => {
  it("accepts email OTP types and rejects others", () => {
    expect(EmailOtpTypeSchema.safeParse("magiclink").success).toBe(true);
    expect(EmailOtpTypeSchema.safeParse("signup").success).toBe(true);
    expect(EmailOtpTypeSchema.safeParse("sms").success).toBe(false);
    expect(EmailOtpTypeSchema.safeParse(null).success).toBe(false);
  });
});
