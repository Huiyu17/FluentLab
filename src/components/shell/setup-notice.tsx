import { Info } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/** Shown while Supabase env vars are missing (unconfigured mode). */
export function SetupNotice() {
  if (isSupabaseConfigured()) return null;

  return (
    <div
      role="status"
      className="border-b border-warning/20 bg-warning-soft px-5 py-3 text-sm sm:px-8 lg:px-12"
    >
      <div className="mx-auto flex max-w-[1080px] items-start gap-2 text-foreground">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>
          <span className="font-medium">Supabase is not configured yet.</span> You can explore the app shell,
          but sign-in and saved data are unavailable. Copy <code>.env.example</code> to{" "}
          <code>.env.local</code> and add your project URL and anon key.
        </p>
      </div>
    </div>
  );
}
