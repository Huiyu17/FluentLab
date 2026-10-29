import { ArrowLeft, BookmarkX } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/shared/states";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { getSavedItem, type ItemDetail } from "@/lib/data/items";
import { pastDay } from "@/lib/dates";
import { ITEM_TYPE_LABELS, REGISTER_LABELS, frequencyLabel } from "@/lib/items";
import { DeleteItemButton } from "./delete-item-button";
import { MasteryBar, reviewStatus } from "./saved-items-list";
import { StudioCardView } from "./studio-card";

type Section = "vocabulary" | "expressions";
const SECTION_LABELS: Record<Section, string> = { vocabulary: "Vocabulary", expressions: "Expressions" };

/** Items saved without a Studio card (curated or manual). */
function PlainItem({ item, actions }: { item: ItemDetail; actions: ReactNode }) {
  return (
    <article className="flex w-full max-w-[720px] flex-col gap-5 rounded-2xl border bg-card p-6 sm:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-serif text-2xl font-semibold">{item.expression}</h1>
          <p className="text-sm text-muted-foreground">
            {ITEM_TYPE_LABELS[item.type]}
            {item.curated &&
              ` · ${REGISTER_LABELS[item.curated.register]} · ${frequencyLabel(item.curated.frequency)}`}
          </p>
        </div>
        {actions}
      </header>
      <p>{item.meaning}</p>
      {item.nativeMeaning && <p className="text-muted-foreground">In your language: {item.nativeMeaning}</p>}
      {item.curated && (
        <p className="text-sm">
          <span className="font-medium">When to use it: </span>
          {item.curated.usedWhen}
        </p>
      )}
      {item.example && <p className="border-l-2 border-primary pl-3">{item.example}</p>}
    </article>
  );
}

function Progress({ item, now, timeZone }: { item: ItemDetail; now: Date; timeZone: string }) {
  return (
    <section
      aria-labelledby="progress-title"
      className="flex max-w-[720px] flex-col gap-4 rounded-2xl border bg-card p-6"
    >
      <h2 id="progress-title" className="text-lg font-semibold">
        Your progress
      </h2>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Mastery</dt>
          <dd>
            <MasteryBar score={item.masteryScore} />
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Next review</dt>
          <dd className="font-medium">{reviewStatus(item.nextReviewAt, now, timeZone)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-sm text-muted-foreground">Reviews</dt>
          <dd className="font-medium">
            {item.reviewCount}
            {item.lastReviewedAt && (
              <span className="font-normal text-muted-foreground">
                {" "}
                · last {pastDay(item.lastReviewedAt, now, timeZone).toLowerCase()}
              </span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Detail page body for a saved item, shared by /vocabulary/[itemId] and /expressions/[itemId]. */
export async function ItemDetailPage({ itemId, section }: { itemId: string; section: Section }) {
  const back = `/${section}`;
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<BookmarkX className="size-5" />}
        title="Saved items need an account"
        description="Supabase is not configured, so nothing can be saved yet."
      />
    );
  }

  const { user, profile } = await requireOnboardedUser(`${back}/${itemId}`);
  const item = await getSavedItem(user.id, itemId);
  if (!item) notFound();
  const now = new Date();

  const actions = <DeleteItemButton itemId={item.id} expression={item.expression} back={back} />;
  return (
    <div className="flex flex-col gap-6">
      <Link
        href={back}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {SECTION_LABELS[section]}
      </Link>
      {item.card ? (
        <StudioCardView card={item.card} headingLevel={1} actions={actions} />
      ) : (
        <PlainItem item={item} actions={actions} />
      )}
      <Progress item={item} now={now} timeZone={profile.timezone} />
    </div>
  );
}
