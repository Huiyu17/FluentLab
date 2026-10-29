import { BookOpen } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shell/page-header";
import { SavedItemsList } from "@/components/studio/saved-items-list";
import { StudioSearch } from "@/components/studio/studio-search";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { listSavedItems } from "@/lib/data/items";

export const metadata: Metadata = { title: "Vocabulary" };

const SUGGESTIONS = ["tentative", "ephemeral"];

async function Vocabulary() {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <div className="flex flex-col gap-10">
        <StudioSearch kind="vocabulary" canSave={false} suggestions={SUGGESTIONS} />
        <EmptyState
          icon={<BookOpen className="size-5" />}
          title="Saved words need an account"
          description="Supabase is not configured, so you can look words up but not save them."
        />
      </div>
    );
  }

  const { user, profile } = await requireOnboardedUser("/vocabulary");
  // All saved items: the list shows words, the Studio needs every id to know what is saved.
  const all = (await listSavedItems(user.id)) ?? [];
  const words = all.filter((item) => item.type === "word");
  const now = new Date();

  return (
    <div className="flex flex-col gap-10">
      <StudioSearch
        kind="vocabulary"
        canSave
        suggestions={SUGGESTIONS}
        savedItemIds={all.map((item) => item.id)}
      />
      <section aria-labelledby="saved-words" className="flex flex-col gap-4">
        <h2 id="saved-words" className="text-xl font-semibold">
          Your saved words{" "}
          {words.length > 0 && <span className="text-muted-foreground">({words.length})</span>}
        </h2>
        {words.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-5" />}
            title="No saved words yet"
            description="Look up a word above and add it to My English. It comes back for review at the right time."
          />
        ) : (
          <SavedItemsList items={words} now={now} timeZone={profile.timezone} />
        )}
      </section>
    </div>
  );
}

export default function VocabularyPage() {
  return (
    <>
      <PageHeader
        title="Vocabulary"
        description="Look up a word to see how native speakers really use it, then save it to My English."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Vocabulary />
      </Suspense>
    </>
  );
}
