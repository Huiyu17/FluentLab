import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeRedirectPath } from "@/lib/validation/redirect";
import { AuthCard, AuthFormSkeleton } from "../auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const CALLBACK_ERRORS: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Request a new one below.",
  unconfigured: "Sign-in isn't available yet: Supabase is not configured for this app.",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads ?next and ?error, so it streams in behind Suspense. */
async function LoginFormWithParams({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const errorKey = first(params.error);
  return (
    <LoginForm
      next={safeRedirectPath(first(params.next))}
      initialError={errorKey ? CALLBACK_ERRORS[errorKey] : undefined}
      configured={isSupabaseConfigured()}
    />
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to keep practicing."
      footer={
        <>
          New to FluentLab?{" "}
          <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<AuthFormSkeleton />}>
        <LoginFormWithParams searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
