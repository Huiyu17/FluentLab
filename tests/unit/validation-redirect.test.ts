import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/validation/redirect";

describe("safeRedirectPath", () => {
  it("keeps same-site paths with query and hash", () => {
    expect(safeRedirectPath("/today")).toBe("/today");
    expect(safeRedirectPath("/gaps/abc?tab=examples#top")).toBe("/gaps/abc?tab=examples#top");
    expect(safeRedirectPath("  /settings  ")).toBe("/settings");
  });

  it("normalizes dot segments without leaving the site", () => {
    expect(safeRedirectPath("/a/../../settings")).toBe("/settings");
  });

  it("falls back for non-strings and empty values", () => {
    expect(safeRedirectPath(undefined)).toBe("/today");
    expect(safeRedirectPath(null)).toBe("/today");
    expect(safeRedirectPath(42)).toBe("/today");
    expect(safeRedirectPath("")).toBe("/today");
  });

  it("uses a custom fallback", () => {
    expect(safeRedirectPath("https://evil.example", "/onboarding")).toBe("/onboarding");
  });

  it.each([
    ["absolute URL", "https://evil.example/today"],
    ["protocol-relative URL", "//evil.example"],
    ["backslash host", "/\\evil.example"],
    ["backslash inside path", "/foo\\bar"],
    ["javascript: URL", "javascript:alert(1)"],
    ["relative path", "today"],
    // Browsers strip tabs/newlines, which would turn these into //evil.example.
    ["tab before host", "/\t/evil.example"],
    ["newline before host", "/\n/evil.example"],
    ["null byte", "/today\u0000"],
  ])("rejects %s", (_label, value) => {
    expect(safeRedirectPath(value)).toBe("/today");
  });

  it("keeps encoded slashes encoded so they stay on this site", () => {
    expect(safeRedirectPath("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
  });
});
