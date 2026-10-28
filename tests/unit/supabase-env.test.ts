import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabaseEnv, isSupabaseConfigured } from "@/lib/supabase/env";

afterEach(() => vi.unstubAllEnvs());

describe("getSupabaseEnv (unconfigured mode)", () => {
  it("returns null when variables are missing or blank", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "  ");
    expect(getSupabaseEnv()).toBeNull();
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("returns null for an invalid URL instead of throwing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not a url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "key");
    expect(getSupabaseEnv()).toBeNull();
  });

  it("returns trimmed values when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://example.supabase.co ");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(getSupabaseEnv()).toEqual({ url: "https://example.supabase.co", anonKey: "anon" });
  });
});
