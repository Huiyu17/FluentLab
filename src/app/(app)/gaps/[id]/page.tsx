import { ArrowLeft, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GapActions } from "@/components/gaps/gap-actions";
import { GapStatusBadge, SeverityBadge } from "@/components/gaps/gap-badges";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { getGap, type GapEvidence } from "@/lib/data/gaps";
import { pastDay } from "@/lib/dates";

export const metadata: Metadata = { title: "Gap" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function EvidenceList({
  items,
  good,
  now,
  timeZone,
}: {
  items: GapEvidence[];
  good: boolean;
  now: Date;
  timeZone: string;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm">
          <dl className="flex flex-col gap-2">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">
                {good ? "What you said" : "You said"}
              </dt>
              <dd className={good ? "font-medium" : "text-muted-foreground"}>{item.original}</dd>
            </div>
            {!good && item.suggestion && (
              <div className="rounded-lg bg-coral-soft px-3 py-2">
                <dt className="text-xs font-medium">More natural</dt>
                <dd className="font-medium">{item.suggestion}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs text-muted-foreground">
            {item.context && `${item.context} · `}
            <Link
              href={`/conversations/${item.conversationId}/review`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {item.conversationTitle}
            </Link>
            {` · ${pastDay(item.createdAt, now, timeZone)}`}
          </p>
        </li>
      ))}
    </ul>
  );
}

async function GapPage({ params }: { params: PageProps<"/gaps/[id]">["params"] }) {
  const { id } = await params;
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<Target className="size-5" />}
        title="The Gap Tracker needs an account"
        description="Supabase is not configured, so there are no gaps yet."
      />
    );
  }

  const { user, profile } = await requireOnboardedUser(`/gaps/${id}`);
  const gap = await getGap(user.id, id);
  if (!gap) notFound();
  const now = new Date();
  const tz = profile.timezone;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/gaps"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Gap Tracker
      </Link>

      <header className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="font-serif text-2xl font-semibold">{gap.title}</h1>
            <div className="flex flex-wrap gap-2">
              <GapStatusBadge status={gap.status} />
              {gap.status !== "dismissed" && <SeverityBadge severity={gap.severity} />}
            </div>
          </div>
          <GapActions gapId={gap.id} title={gap.title} dismissed={gap.status === "dismissed"} />
        </div>
        <p className="leading-relaxed">{gap.description}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Seen</dt>
            <dd className="font-medium">
              {gap.evidenceCount}× in {plural(gap.conversationsCount, "conversation")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">First noticed</dt>
            <dd className="font-medium">
              {gap.firstDetectedAt ? pastDay(gap.firstDetectedAt, now, tz) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last seen</dt>
            <dd className="font-medium">{gap.lastDetectedAt ? pastDay(gap.lastDetectedAt, now, tz) : "—"}</dd>
          </div>
        </dl>
        {gap.status === "dismissed" && (
          <p role="note" className="rounded-lg bg-muted px-3 py-2 text-sm">
            Dismissed: new examples are still recorded, but this gap won&apos;t come back as a focus area
            unless you restore it.
          </p>
        )}
      </header>

      <section aria-labelledby="gap-evidence" className="flex flex-col gap-3">
        <h2 id="gap-evidence" className="text-lg font-semibold">
          Examples from your conversations
        </h2>
        {gap.evidence.length > 0 ? (
          <EvidenceList items={gap.evidence} good={false} now={now} timeZone={tz} />
        ) : (
          <p className="text-sm text-muted-foreground">No examples to show.</p>
        )}
      </section>

      {gap.goodUsages.length > 0 && (
        <section aria-labelledby="gap-good" className="flex flex-col gap-3">
          <h2 id="gap-good" className="text-lg font-semibold">
            When you got it right
          </h2>
          <EvidenceList items={gap.goodUsages} good now={now} timeZone={tz} />
        </section>
      )}
    </div>
  );
}

export default function Page({ params }: PageProps<"/gaps/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <GapPage params={params} />
    </Suspense>
  );
}
