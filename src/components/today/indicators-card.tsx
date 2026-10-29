import Link from "next/link";
import type { Indicators } from "@/lib/data/today";
import { pastDay } from "@/lib/dates";
import { SCORE_DIMENSIONS, type ScoreDimension } from "@/lib/domain/taxonomy";
import { CardEmpty, DashboardCard } from "./dashboard-card";

const DIMENSION_LABELS: Record<ScoreDimension, string> = {
  fluency: "Fluency",
  naturalness: "Naturalness",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  confidence: "Confidence",
};

const OVERALL_LABELS: Record<Indicators["overallLabel"], string> = {
  needs_work: "Needs work",
  developing: "Developing",
  good_communication: "Good communication",
  strong: "Strong",
};

// Required wording wherever scores appear (docs/PRODUCT.md, principle 4).
export const INDICATORS_CAPTION = "AI-estimated learning indicators";

export function IndicatorsCard({
  indicators,
  now,
  timeZone,
  className,
}: {
  indicators: Indicators | null;
  now: Date;
  timeZone: string;
  className?: string;
}) {
  return (
    <DashboardCard
      id="indicators"
      title="Latest indicators"
      description={INDICATORS_CAPTION}
      className={className}
    >
      {!indicators ? (
        <CardEmpty
          title="No indicators yet"
          description="After a conversation review you'll see estimates for fluency, naturalness, grammar, vocabulary and confidence."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            <span className="font-medium">{OVERALL_LABELS[indicators.overallLabel]}</span>
            <span className="text-muted-foreground"> · {pastDay(indicators.at, now, timeZone)}</span>
          </p>
          <ul className="flex flex-col gap-3">
            {SCORE_DIMENSIONS.map((dimension) => {
              const score = indicators.scores[dimension];
              return (
                <li key={dimension} className="flex flex-col gap-1.5">
                  <span className="flex justify-between text-sm">
                    <span>{DIMENSION_LABELS[dimension]}</span>
                    <span className="font-medium tabular-nums">
                      {score}
                      <span className="sr-only"> out of 100</span>
                    </span>
                  </span>
                  <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Estimates to track your own progress, not an official assessment.{" "}
            <Link
              href={`/conversations/${indicators.conversationId}/review`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              See the review
            </Link>
          </p>
        </div>
      )}
    </DashboardCard>
  );
}
