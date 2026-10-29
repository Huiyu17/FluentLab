import { MessageSquareQuote } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shell/page-header";
import { CuratedList } from "@/components/studio/curated-list";
import { SavedItemsList } from "@/components/studio/saved-items-list";
import { StudioSearch } from "@/components/studio/studio-search";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { listCuratedExpressions, listSavedItems } from "@/lib/data/items";

export const metadata: Metadata = { title: "Expressions" };

const SUGGESTIONS = ["touch base", "Could you walk me through…?"];

async function Expressions() {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <div className="flex flex-col gap-10">
        <StudioSearch kind="expression" canSave={false} suggestions={SUGGESTIONS} />
        <EmptyState
          icon={<MessageSquareQuote className="size-5" />}
          title="Saved expressions need an account"
          description="Supabase is not configured, so you can look expressions up but not save them."
        />
      </div>
    );
  }

  const { user, profile } = await requireOnboardedUser("/expressions");
  const [all, curated] = await Promise.all([listSavedItems(user.id), listCuratedExpressions(user.id)]);
  // All saved items: the list shows phrases and expressions, the Studio needs every id.
  const saved = (all ?? []).filter((item) => item.type !== "word");
  const now = new Date();

  return (
    <div className="flex flex-col gap-10">
      <StudioSearch
        kind="expression"
        canSave
        suggestions={SUGGESTIONS}
        savedItemIds={(all ?? []).map((item) => item.id)}
      />

      <section aria-labelledby="saved-expressions" className="flex flex-col gap-4">
        <h2 id="saved-expressions" className="text-xl font-semibold">
          Your saved expressions{" "}
          {saved.length > 0 && <span className="text-muted-foreground">({saved.length})</span>}
        </h2>
        {saved.length === 0 ? (
          <EmptyState
            icon={<MessageSquareQuote className="size-5" />}
            title="No saved expressions yet"
            description="Look one up above, or add one of the everyday expressions below."
          />
        ) : (
          <SavedItemsList items={saved} now={now} timeZone={profile.timezone} showType />
        )}
      </section>

      {curated && curated.length > 0 && (
        <section aria-labelledby="curated" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="curated" className="text-xl font-semibold">
              Everyday expressions
            </h2>
            <p className="text-sm text-muted-foreground">
              Hand-picked phrases for campus, work and social situations.
            </p>
          </div>
          <CuratedList items={curated} />
        </section>
      )}
    </div>
  );
}

export default function ExpressionsPage() {
  return (
    <>
      <PageHeader
        title="Expressions"
        description="Phrases and natural expressions: what they mean, how they feel, and when to use them."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Expressions />
      </Suspense>
    </>
  );
}
