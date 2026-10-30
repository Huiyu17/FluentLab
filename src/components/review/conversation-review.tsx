import type { OverallLabel } from "@/lib/ai/schemas/review";
import type { ConversationMessage } from "@/lib/data/conversations";
import type { ConversationReviewView, ReviewCorrection } from "@/lib/data/reviews";
import { CATEGORY_LABELS, SCORE_DIMENSIONS, type ScoreDimension } from "@/lib/domain/taxonomy";
import { cn } from "@/lib/utils";
import { SaveExpressionButton } from "./save-expression-button";

export const OVERALL_LABEL_TEXT: Record<OverallLabel, string> = {
  needs_work: "Needs work",
  developing: "Developing",
  good_communication: "Good communication",
  strong: "Strong",
};

const SCORE_LABELS: Record<ScoreDimension, string> = {
  fluency: "Fluency",
  naturalness: "Naturalness",
  grammar: "Grammar",
  vocabulary: "Vocabulary",
  confidence: "Confidence",
};

const humanize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");

/** One saveable expression, with where it came from and whether it's already in My English. */
export type WorthSaving = {
  correctionId: string;
  index: number;
  expression: string;
  meaning: string;
  savedItemId: string | null;
};

/** Summary on top: overall label and summary, the five indicators, strengths, expressions worth saving. */
export function ReviewSummary({
  review,
  worthSaving,
  sample,
}: {
  review: ConversationReviewView;
  worthSaving: WorthSaving[];
  sample: boolean;
}) {
  return (
    <section
      aria-labelledby="review-summary-title"
      className="flex flex-col gap-5 rounded-2xl border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="review-summary-title" className="font-serif text-xl font-semibold">
          How it went
        </h2>
        <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-sm font-medium text-primary">
          {OVERALL_LABEL_TEXT[review.overallLabel]}
        </span>
      </div>
      {sample && (
        <p role="note" className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
          Sample review: AI isn&apos;t connected, so this review comes from a short script.
        </p>
      )}
      <p className="leading-relaxed">{review.summary}</p>

      <div className="flex flex-col gap-3">
        <dl className="grid gap-3 sm:grid-cols-5">
          {SCORE_DIMENSIONS.map((dimension) => {
            const score = review.scores[dimension];
            return (
              <div key={dimension} className="flex flex-col gap-1.5">
                <dt className="text-sm text-muted-foreground">{SCORE_LABELS[dimension]}</dt>
                <dd className="flex flex-col gap-1.5">
                  <span className="text-lg font-semibold tabular-nums">{score}</span>
                  <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="text-xs text-muted-foreground">
          AI-estimated learning indicators for this conversation (0–100), not an official assessment.
        </p>
      </div>

      {review.strengths.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium">What you did well</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {review.strengths.map((strength) => (
              <li key={strength}>{strength}</li>
            ))}
          </ul>
        </div>
      )}

      {worthSaving.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-medium">Expressions worth saving</h3>
          <ul className="flex flex-col divide-y rounded-xl border">
            {worthSaving.map((item) => (
              <li
                key={`${item.correctionId}-${item.index}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium">{item.expression}</span>
                  <span className="text-sm text-muted-foreground">{item.meaning}</span>
                </div>
                <SaveExpressionButton
                  correctionId={item.correctionId}
                  index={item.index}
                  expression={item.expression}
                  savedItemId={item.savedItemId}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function CorrectionCard({ correction }: { correction: ReviewCorrection }) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border bg-card p-4 text-sm">
      <div className="flex flex-wrap gap-2 text-xs">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-medium",
            correction.isGrammatical ? "bg-muted text-foreground" : "bg-coral-soft text-coral",
          )}
        >
          {correction.isGrammatical ? "Grammatically correct, could sound more natural" : "Grammar error"}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
          {CATEGORY_LABELS[correction.category]}
          {correction.subCategory && ` · ${humanize(correction.subCategory)}`}
        </span>
      </div>
      <dl className="flex flex-col gap-2">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">What you said</dt>
          <dd className="text-muted-foreground">{correction.original}</dd>
        </div>
        <div className="rounded-lg bg-coral-soft px-3 py-2">
          <dt className="text-xs font-medium">More natural</dt>
          <dd className="font-medium">{correction.improved}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Why</dt>
          <dd>{correction.explanation}</dd>
        </div>
      </dl>
      {correction.saveableExpressions.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Worth saving: {correction.saveableExpressions.map((e) => e.expression).join(" · ")}
        </p>
      )}
    </div>
  );
}

/**
 * The conversation with each learner message annotated in place. A message without a correction
 * is only "not selected" (the reviewer picks at most 8), so it gets a quiet "No suggestions",
 * never a mark saying it was correct.
 */
export function AnnotatedTranscript({
  messages,
  corrections,
  speaker,
}: {
  messages: ConversationMessage[];
  corrections: ReviewCorrection[];
  speaker: string;
}) {
  const byMessage = new Map<string, ReviewCorrection[]>();
  for (const correction of corrections) {
    byMessage.set(correction.messageId, [...(byMessage.get(correction.messageId) ?? []), correction]);
  }

  return (
    <section aria-labelledby="review-transcript-title" className="flex flex-col gap-3">
      <h2 id="review-transcript-title" className="font-serif text-xl font-semibold">
        Your conversation
      </h2>
      <ol aria-label="Conversation with review" className="flex flex-col gap-4">
        {messages.map((message) => {
          const own = message.role === "user";
          const notes = byMessage.get(message.id) ?? [];
          return (
            <li key={message.id} className={cn("flex flex-col gap-1.5", own ? "items-end" : "items-start")}>
              <span className="px-1 text-xs text-muted-foreground">{own ? "You" : speaker}</span>
              <p
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 whitespace-pre-wrap sm:max-w-[75%]",
                  own ? "rounded-br-sm bg-primary-soft" : "rounded-bl-sm border bg-card",
                )}
              >
                {message.content}
              </p>
              {own &&
                (notes.length > 0 ? (
                  <div className="flex w-full flex-col gap-2 sm:w-[85%]">
                    {notes.map((correction) => (
                      <CorrectionCard key={correction.id} correction={correction} />
                    ))}
                  </div>
                ) : (
                  <p className="px-1 text-xs text-muted-foreground">No suggestions</p>
                ))}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
