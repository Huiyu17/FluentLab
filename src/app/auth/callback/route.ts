import { NextResponse, type NextRequest } from "next/server";

// Supabase Auth callback (magic link / email confirmation). Implemented in M2.
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url));
}
