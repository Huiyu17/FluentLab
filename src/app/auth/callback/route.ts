import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EmailOtpTypeSchema } from "@/lib/validation/auth";
import { safeRedirectPath } from "@/lib/validation/redirect";

/**
 * Landing point for Supabase email links (sign-up confirmation, magic link).
 *
 * Supports both link styles:
 * - `?token_hash=…&type=…` (recommended email template; works in any browser)
 * - `?code=…` (default PKCE link; only works in the browser that requested it)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get("next"));

  const fail = (reason: "link_invalid" | "unconfigured") =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));

  // Supabase appends ?error=… (e.g. otp_expired) when the link is no longer valid.
  if (searchParams.has("error")) return fail("link_invalid");

  const supabase = await createClient();
  if (!supabase) return fail("unconfigured");

  const tokenHash = searchParams.get("token_hash");
  const type = EmailOtpTypeSchema.safeParse(searchParams.get("type"));
  const code = searchParams.get("code");

  let error: { code?: string; status?: number } | null;
  if (tokenHash && type.success) {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type.data }));
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    return fail("link_invalid");
  }

  if (error) {
    console.error("[auth] callback verification failed", { code: error.code, status: error.status });
    return fail("link_invalid");
  }

  return NextResponse.redirect(new URL(next, request.url));
}
