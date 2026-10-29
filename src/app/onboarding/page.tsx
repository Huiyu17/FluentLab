import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { profileToValues } from "@/components/profile/profile-values";
import { Brand } from "@/components/shell/brand";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { requireOnboardingPending } from "@/lib/auth/dal";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = { title: "Welcome" };

/** Signed-out users go to /login, onboarded users to /today. */
async function Onboarding() {
  const pending = await requireOnboardingPending();

  if (!pending) {
    return (
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border bg-card p-8 text-center">
        <h1 className="font-serif text-2xl font-semibold">Let&apos;s set up your practice</h1>
        <p className="text-muted-foreground">
          Supabase is not configured, so your answers can&apos;t be saved yet. You can still look around the
          app.
        </p>
        <Button asChild>
          <Link href="/today">Explore the app</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <OnboardingWizard initial={profileToValues(pending.profile)} />
      {/* The sidebar's sign-out isn't reachable until onboarding is done. */}
      <form action={signOut} className="text-sm text-muted-foreground">
        Signed in as {pending.user.email ?? "your account"}.{" "}
        <Button type="submit" variant="link" className="h-auto p-0">
          Sign out
        </Button>
      </form>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-12">
      <Brand />
      <Suspense
        fallback={<div aria-hidden className="h-[28rem] w-full max-w-lg rounded-2xl border bg-card" />}
      >
        <Onboarding />
      </Suspense>
    </main>
  );
}
