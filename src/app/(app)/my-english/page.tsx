import { Bookmark, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shell/page-header";
import { SavedItemsList } from "@/components/studio/saved-items-list";
import { Button } from "@/components/ui/button";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { listSavedItems } from "@/lib/data/items";
import { filterItems, isDue, itemFiltersQuery, parseItemFilters, type ItemFilters } from "@/lib/items";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My English" };

/** Mastery at or above this counts as "well known". */
const WELL_KNOWN = 0.8;

const TYPE_OPTIONS: { value: ItemFilters["type"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "word", label: "Words" },
  { value: "expression", label: "Phrases & expressions" },
];
const STATUS_OPTIONS: { value: ItemFilters["status"]; label: string }[] = [
  { value: "all", label: "Any time" },
  { value: "due", label: "Due now" },
];

function FilterGroup<K extends keyof ItemFilters>({
  label,
  name,
  options,
  filters,
}: {
  label: string;
  name: K;
  options: { value: ItemFilters[K]; label: string }[];
  filters: ItemFilters;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <ul className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = filters[name] === option.value;
          return (
            <li key={option.value}>
              <Link
                href={`/my-english${itemFiltersQuery({ ...filters, [name]: option.value })}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex rounded-full border px-3 py-1 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                  active
                    ? "border-primary bg-primary-soft font-medium text-primary"
                    : "bg-card hover:bg-accent",
                )}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

async function MyEnglish({ searchParams }: { searchParams: PageProps<"/my-english">["searchParams"] }) {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<Bookmark className="size-5" />}
        title="My English needs an account"
        description="Supabase is not configured, so there are no saved items yet."
      />
    );
  }

  const { user, profile } = await requireOnboardedUser("/my-english");
  const filters = parseItemFilters(await searchParams);
  const items = (await listSavedItems(user.id)) ?? [];
  const now = new Date();

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Bookmark className="size-5" />}
        title="Nothing saved yet"
        description="Look up words and expressions in the Studio and add them here. They come back for review just before you'd forget them."
        action={
          <Button asChild>
            <Link href="/expressions">Explore expressions</Link>
          </Button>
        }
      />
    );
  }

  const dueCount = items.filter((item) => isDue(item, now)).length;
  const wellKnown = items.filter((item) => item.masteryScore >= WELL_KNOWN).length;
  const shown = filterItems(items, filters, now);

  return (
    <div className="flex flex-col gap-8">
      <section
        aria-label="Overview"
        className="flex flex-col gap-5 rounded-2xl border bg-card p-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <dl className="grid grid-cols-3 gap-6 sm:gap-10">
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">Saved</dt>
            <dd className="font-serif text-3xl font-semibold lining-nums">{items.length}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">Due now</dt>
            <dd className="font-serif text-3xl font-semibold lining-nums">{dueCount}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted-foreground">Well known</dt>
            <dd className="font-serif text-3xl font-semibold lining-nums">{wellKnown}</dd>
          </div>
        </dl>
        {dueCount > 0 ? (
          <Button asChild>
            <Link href="/my-english/review">
              <RotateCcw aria-hidden />
              Start review ({dueCount})
            </Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">All caught up. Nothing is due right now.</p>
        )}
      </section>

      <nav aria-label="Filter saved items" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-6">
        <FilterGroup label="Show" name="type" options={TYPE_OPTIONS} filters={filters} />
        <FilterGroup label="Review" name="status" options={STATUS_OPTIONS} filters={filters} />
      </nav>

      {shown.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed bg-card p-6">
          <p className="font-medium">Nothing matches these filters</p>
          <p className="text-sm text-muted-foreground">
            {filters.status === "due" ? "Nothing of this kind is due right now." : "Try a different filter."}
          </p>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <Link href="/my-english">Clear filters</Link>
          </Button>
        </div>
      ) : (
        <section aria-label="Saved items" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Showing {shown.length} of {items.length}
          </p>
          <SavedItemsList items={shown} now={now} timeZone={profile.timezone} showType />
        </section>
      )}
    </div>
  );
}

export default function MyEnglishPage({ searchParams }: PageProps<"/my-english">) {
  return (
    <>
      <PageHeader
        title="My English"
        description="Everything you've saved, ready to review and reuse in conversation."
      />
      <Suspense fallback={<PageSkeleton />}>
        <MyEnglish searchParams={searchParams} />
      </Suspense>
    </>
  );
}
