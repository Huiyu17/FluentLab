import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Brand } from "@/components/shell/brand";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { requireOnboardingPending } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Welcome" };

const STEPS = [
  "Your native language",
  "Where you use English (campus, social, career…)",
  "What you want to get better at",
  "How many minutes a day",
];

/** Signed-out users go to /login, onboarded users to /today. */
async function OnboardingGate({ children }: { children: ReactNode }) {
  const pending = await requireOnboardingPending();
  return (
    <>
      {children}
      {/* The sidebar's sign-out isn't reachable until onboarding is done. */}
      {pending && (
        <form action={signOut} className="text-sm text-muted-foreground">
          Signed in as {pending.user.email ?? "your account"}.{" "}
          <Button type="submit" variant="link" className="h-auto p-0">
            Sign out
          </Button>
        </form>
      )}
    </>
  );
}

export default function OnboardingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-12">
      <Brand />
      <Suspense fallback={<div aria-hidden className="h-80 w-full max-w-md rounded-2xl border bg-card" />}>
        <OnboardingGate>
          <OnboardingPlaceholder />
        </OnboardingGate>
      </Suspense>
    </main>
  );
}

function OnboardingPlaceholder() {
  return (
    <>
      <div className="flex w-full max-w-md flex-col gap-6 rounded-2xl border bg-card p-8">
        <div className="flex flex-col gap-2">
          <h1 className="font-serif text-2xl font-semibold">Let&apos;s set up your practice</h1>
          <p className="text-muted-foreground">
            Onboarding arrives in M2. It will ask four quick questions so FluentLab can tailor your
            conversations:
          </p>
        </div>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <Button asChild>
          <Link href="/today">Continue to Today</Link>
        </Button>
      </div>
    </>
  );
}
