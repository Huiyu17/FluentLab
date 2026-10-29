import { UserRound } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { profileToValues } from "@/components/profile/profile-values";
import { EmptyState } from "@/components/shared/states";
import { PageSkeleton } from "@/components/shared/skeletons";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Settings" };

async function SettingsContent() {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<UserRound className="size-5" />}
        title="Settings need an account"
        description="Supabase is not configured, so there is no profile to edit yet."
      />
    );
  }

  const { user, profile } = await requireOnboardedUser("/settings");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <ProfileForm initial={profileToValues(profile)} />

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Account</h2>
          <p className="text-sm text-muted-foreground">Signed in as {user.email ?? "your account"}.</p>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Your profile, goals and account." />
      <Suspense fallback={<PageSkeleton />}>
        <SettingsContent />
      </Suspense>
    </>
  );
}
