import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";
import { getCurrentProfile, getCurrentUser } from "@/lib/auth/dal";

/** Who is signed in, plus a sign-out button. Renders nothing when signed out or unconfigured. */
export async function AccountMenu() {
  const user = await getCurrentUser();
  if (!user) return null;
  const profile = await getCurrentProfile();
  const name = profile?.displayName ?? user.email ?? "Your account";

  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="min-w-0 px-3">
        <p className="truncate text-sm font-medium">{name}</p>
        {user.email && name !== user.email && (
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        )}
      </div>
      <form action={signOut}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
        >
          <LogOut aria-hidden />
          Sign out
        </Button>
      </form>
    </div>
  );
}
