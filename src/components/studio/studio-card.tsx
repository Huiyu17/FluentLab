import type { ReactNode } from "react";
import type { StudioCard } from "@/lib/ai/schemas/studio";
import { ITEM_TYPE_LABELS, REGISTER_LABELS, frequencyLabel } from "@/lib/items";

export const SAMPLE_NOTICE =
  "Sample explanation: AI isn't connected yet, so parts of this card are placeholder text.";

const chip =
  "inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/** A Studio explanation (docs/PRODUCT.md → Explanation style). Reading surface, max 720px. */
export function StudioCardView({
  card,
  sample = false,
  actions,
  headingLevel = 2,
}: {
  card: StudioCard;
  sample?: boolean;
  actions?: ReactNode;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <article
      aria-labelledby="studio-card-title"
      className="flex w-full max-w-[720px] flex-col gap-6 rounded-2xl border bg-card p-6 sm:p-8"
    >
      {sample && (
        <p role="note" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          {SAMPLE_NOTICE}
        </p>
      )}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Heading id="studio-card-title" className="font-serif text-2xl font-semibold">
            {card.expression}
          </Heading>
          <p className="text-sm text-muted-foreground">
            {ITEM_TYPE_LABELS[card.type]}
            {card.ipa && <span className="font-mono"> · {card.ipa}</span>}
          </p>
          <p className="flex flex-wrap gap-2 pt-1">
            <span className={chip}>{REGISTER_LABELS[card.register]}</span>
            <span className={chip}>{frequencyLabel(card.frequency)}</span>
          </p>
        </div>
        {actions}
      </header>

      <Section title="Meaning">
        <p>{card.coreMeaning}</p>
        {card.nativeMeaning && (
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">In your language:</span> {card.nativeMeaning}
          </p>
        )}
      </Section>

      <Section title="How it feels">
        <p>{card.nativeIntuition}</p>
      </Section>

      {card.patterns.length > 0 && (
        <Section title="Common patterns">
          <ul className="flex flex-wrap gap-2">
            {card.patterns.map((pattern) => (
              <li key={pattern} className="rounded-lg border px-2.5 py-1 text-sm">
                {pattern}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Examples">
        <ul className="flex flex-col gap-2">
          {card.examples.map((example) => (
            <li key={example} className="border-l-2 border-primary pl-3">
              {example}
            </li>
          ))}
        </ul>
      </Section>

      {card.commonMistake && (
        <Section title="Common mistake">
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground">
              <span aria-hidden>❌ </span>
              <span className="sr-only">Avoid: </span>
              {card.commonMistake.wrong}
            </p>
            {card.commonMistake.right.map((right) => (
              <p key={right} className="rounded-lg bg-coral-soft px-3 py-2">
                <span aria-hidden>✅ </span>
                <span className="sr-only">Say: </span>
                {right}
              </p>
            ))}
          </div>
        </Section>
      )}

      {card.similar.length > 0 && (
        <Section title="Similar expressions">
          <dl className="flex flex-col gap-2">
            {card.similar.map((item) => (
              <div key={item.expression} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                <dt className="font-medium sm:shrink-0">{item.expression}</dt>
                <dd className="text-muted-foreground">
                  <span aria-hidden className="hidden sm:inline">
                    ·{" "}
                  </span>
                  {item.nuance}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title="Try it">
        <p className="rounded-xl bg-primary-soft p-4">{card.tryIt}</p>
      </Section>
    </article>
  );
}
