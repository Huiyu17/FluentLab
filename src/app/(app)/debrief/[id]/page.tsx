import { ArrowLeft, NotebookPen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PracticeSituation } from "@/components/debrief/practice-situation";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { SaveExpressionButton } from "@/components/shared/save-expression-button";
import { PageSkeleton } from "@/components/shared/skeletons";
import { EmptyState } from "@/components/shared/states";
import { deleteDebriefAction, saveDebriefExpressionAction } from "@/lib/actions/debrief";
import { PHRASING_REGISTERS, type PhrasingRegister } from "@/lib/ai/schemas/debrief";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { getDebrief } from "@/lib/data/debriefs";
import { expressionKey, findSavedExpressions } from "@/lib/data/reviews";
import { pastDay } from "@/lib/dates";

export const metadata: Metadata = { title: "Debrief" };

const REGISTER_LABELS: Record<PhrasingRegister, { title: string; hint: string }> = {
  casual: { title: "Casual", hint: "Friends, classmates, people your age" },
  neutral: { title: "Neutral", hint: "Works in most places" },
  formal: { title: "Formal", hint: "Staff, professors, people you don't know" },
};

async function DebriefPage({ params }: { params: PageProps<"/debrief/[id]">["params"] }) {
  const { id } = await params;
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<NotebookPen className="size-5" />}
        title="Debriefs need an account"
        description="Supabase is not configured, so there are no debriefs yet."
      />
    );
  }

  const { user, profile } = await requireOnboardedUser(`/debrief/${id}`);
  const debrief = await getDebrief(user.id, id);
  if (!debrief) notFound();
  const { result } = debrief;
  const saved = await findSavedExpressions(
    user.id,
    result.expressions.map((e) => e.expression),
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/debrief"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Real-Life Debrief
      </Link>

      <header className="flex flex-col gap-3 rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-primary">
              Debrief · {pastDay(debrief.createdAt, new Date(), profile.timezone)}
            </p>
            <h1 className="font-serif text-2xl font-semibold">{result.situationSummary}</h1>
          </div>
          <ConfirmDelete
            action={deleteDebriefAction}
            fields={{ debriefId: debrief.id }}
            question="Delete this debrief? Expressions you saved stay in My English."
          />
        </div>
        {debrief.sample && (
          <p role="note" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            Sample debrief: AI isn&apos;t connected, so these phrasings come from a short script.
          </p>
        )}
        <dl className="flex flex-col gap-3 text-sm">
          <div>
            <dt className="font-medium text-muted-foreground">What happened</dt>
            <dd className="whitespace-pre-wrap">{debrief.situation}</dd>
          </div>
          {debrief.whatYouSaid && (
            <div>
              <dt className="font-medium text-muted-foreground">What you said</dt>
              <dd className="whitespace-pre-wrap">{debrief.whatYouSaid}</dd>
            </div>
          )}
        </dl>
      </header>

      <section aria-labelledby="phrasings-title" className="flex flex-col gap-3">
        <h2 id="phrasings-title" className="font-serif text-xl font-semibold">
          Ways to say it
        </h2>
        {PHRASING_REGISTERS.map((register) => {
          const phrasings = result.phrasings.filter((p) => p.register === register);
          if (phrasings.length === 0) return null;
          return (
            <section
              key={register}
              aria-labelledby={`register-${register}`}
              className="flex flex-col gap-2 rounded-2xl border bg-card p-5"
            >
              <h3 id={`register-${register}`} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">{REGISTER_LABELS[register].title}</span>
                <span className="text-sm text-muted-foreground">{REGISTER_LABELS[register].hint}</span>
              </h3>
              <ul className="flex flex-col gap-3">
                {phrasings.map((p) => (
                  <li key={p.text} className="flex flex-col gap-1">
                    <p className="rounded-lg bg-coral-soft px-3 py-2 font-medium">&ldquo;{p.text}&rdquo;</p>
                    <p className="text-sm text-muted-foreground">{p.note}</p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </section>

      <section aria-labelledby="why-title" className="flex flex-col gap-2 rounded-2xl border bg-card p-5">
        <h2 id="why-title" className="font-semibold">
          Why
        </h2>
        <p className="leading-relaxed">{result.explanation}</p>
      </section>

      <section
        aria-labelledby="practice-title"
        className="flex flex-col gap-3 rounded-2xl bg-primary-soft p-5 sm:p-6"
      >
        <div className="flex flex-col gap-1">
          <h2 id="practice-title" className="font-serif text-xl font-semibold">
            Practice it
          </h2>
          <p className="text-sm">Replay this situation in the simulator, so the words are ready next time.</p>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Scenario</dt>
            <dd className="font-medium">{result.scenario.title}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">You are</dt>
            <dd>{result.scenario.userRole}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">You&apos;re talking to</dt>
            <dd>{result.scenario.aiRole}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Your goal</dt>
            <dd>{result.scenario.goal}</dd>
          </div>
        </dl>
        <PracticeSituation debriefId={debrief.id} scenarioId={debrief.scenarioId} />
      </section>

      {result.expressions.length > 0 && (
        <section aria-labelledby="debrief-expressions" className="flex flex-col gap-2">
          <h2 id="debrief-expressions" className="font-semibold">
            Expressions worth saving
          </h2>
          <ul className="flex flex-col divide-y rounded-2xl border bg-card">
            {result.expressions.map((e, index) => (
              <li key={e.expression} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{e.expression}</span>
                  <span className="text-sm text-muted-foreground">{e.meaning}</span>
                </div>
                <SaveExpressionButton
                  action={saveDebriefExpressionAction}
                  fields={{ debriefId: debrief.id, index: String(index) }}
                  expression={e.expression}
                  savedItemId={saved.get(expressionKey(e.expression)) ?? null}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function Page({ params }: PageProps<"/debrief/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DebriefPage params={params} />
    </Suspense>
  );
}
