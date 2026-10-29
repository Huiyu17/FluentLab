"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { recordReviewAction } from "@/lib/actions/review";
import type { ReviewItem } from "@/lib/data/items";
import { REVIEW_RATINGS, intervalLabel, type ReviewRating } from "@/lib/domain/scheduling";
import { ITEM_TYPE_LABELS } from "@/lib/items";
import { cn } from "@/lib/utils";

const RATING_LABELS: Record<ReviewRating, string> = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

const EMPTY_TALLY: Record<ReviewRating, number> = { again: 0, hard: 0, good: 0, easy: 0 };

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/**
 * Flashcard review: show the expression, optionally use it in a sentence, reveal, rate.
 * "Again" sends the card to the back of the queue so it comes back this session.
 */
export function ReviewSession({ items }: { items: ReviewItem[] }) {
  const [queue, setQueue] = useState(items);
  const [revealed, setRevealed] = useState(false);
  const [sentence, setSentence] = useState("");
  const [tally, setTally] = useState(EMPTY_TALLY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const goodRef = useRef<HTMLButtonElement>(null);
  const started = useRef(false);

  const current = queue[0];
  const finished = items.length - new Set(queue.map((item) => item.id)).size;

  // Keyboard users follow the session: new card → its heading, revealed → the "Good" button.
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      return;
    }
    (revealed ? goodRef.current : headingRef.current)?.focus();
  }, [current?.id, current?.reviewCount, revealed]);

  function rate(rating: ReviewRating) {
    if (!current || pending) return;
    const mode = sentence.trim() ? "use_in_sentence" : "recall";
    startTransition(async () => {
      const result = await recordReviewAction({
        itemId: current.id,
        rating,
        mode,
        expectedReviewCount: current.reviewCount,
      });
      if (result.status === "error") {
        setError(result.message);
        return;
      }
      setError(null);
      if (result.status === "recorded" && result.applied) {
        setTally((t) => ({ ...t, [rating]: t[rating] + 1 }));
      }
      setQueue((q) => {
        const rest = q.slice(1);
        // "Again": comes back at the end, with the state the database just wrote.
        return result.status === "recorded" && rating === "again"
          ? [...rest, { ...current, ...result.state }]
          : rest;
      });
      setRevealed(false);
      setSentence("");
    });
  }

  // 1–4 rate once the answer is showing (not while typing).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!revealed || pending || isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const rating = REVIEW_RATINGS[Number(event.key) - 1];
      if (rating) {
        event.preventDefault();
        rate(rating);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!current) {
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    return (
      <section
        aria-labelledby="review-done"
        className="flex max-w-[720px] flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-12 text-center"
      >
        <CheckCircle2 aria-hidden className="size-10 text-primary" />
        <h2 id="review-done" className="font-serif text-2xl font-semibold">
          Review done
        </h2>
        <p className="text-muted-foreground">
          You reviewed {items.length} {items.length === 1 ? "item" : "items"}
          {total > items.length && ` (${total} answers, including repeats)`}.
        </p>
        <dl className="flex flex-wrap justify-center gap-6">
          {REVIEW_RATINGS.map((rating) => (
            <div key={rating} className="flex flex-col items-center">
              <dt className="text-sm text-muted-foreground">{RATING_LABELS[rating]}</dt>
              <dd className="text-xl font-semibold tabular-nums">{tally[rating]}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button asChild>
            <Link href="/today">Back to Today</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/my-english">My English</Link>
          </Button>
        </div>
      </section>
    );
  }

  const schedule = {
    ease: current.ease,
    intervalDays: current.intervalDays,
    masteryScore: current.masteryScore,
  };

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {finished} of {items.length} done
        </p>
        <div
          role="progressbar"
          aria-label="Review progress"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={finished}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none"
            style={{ width: `${(finished / items.length) * 100}%` }}
          />
        </div>
      </div>

      <article
        aria-labelledby="review-card-title"
        className="flex flex-col gap-6 rounded-2xl border bg-card p-6 sm:p-8"
      >
        <header className="flex flex-col gap-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {ITEM_TYPE_LABELS[current.type]}
          </p>
          <h2
            id="review-card-title"
            ref={headingRef}
            tabIndex={-1}
            className="font-serif text-3xl font-semibold outline-none"
          >
            {current.expression}
          </h2>
        </header>

        {!revealed ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="review-sentence">
                Use it in a sentence <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              {current.tryIt && <p className="text-sm text-muted-foreground">{current.tryIt}</p>}
              <Textarea
                id="review-sentence"
                rows={2}
                maxLength={500}
                value={sentence}
                onChange={(e) => setSentence(e.target.value)}
                placeholder="Try to recall what it means first, then use it."
              />
            </div>
            <Button type="button" className="self-start" onClick={() => setRevealed(true)}>
              Show answer
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <p>{current.meaning}</p>
              {current.nativeMeaning && (
                <p className="text-muted-foreground">In your language: {current.nativeMeaning}</p>
              )}
              {current.example && <p className="border-l-2 border-primary pl-3">{current.example}</p>}
              {sentence.trim() && (
                <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                  <span className="font-medium">Your sentence: </span>
                  {sentence.trim()}
                </p>
              )}
            </div>

            <fieldset className="flex flex-col gap-3" disabled={pending}>
              <legend className="mb-3 text-sm font-medium">How well did you know it?</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {REVIEW_RATINGS.map((rating, i) => (
                  <Button
                    key={rating}
                    ref={rating === "good" ? goodRef : undefined}
                    type="button"
                    variant={rating === "good" ? "default" : "outline"}
                    className={cn("h-auto flex-col gap-0.5 py-2", rating === "again" && "text-destructive")}
                    onClick={() => rate(rating)}
                    aria-keyshortcuts={String(i + 1)}
                  >
                    <span>{RATING_LABELS[rating]}</span>
                    <span className="text-xs font-normal opacity-80">{intervalLabel(schedule, rating)}</span>
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Keys 1–4 also work.</p>
            </fieldset>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2.5 text-sm">
            {error}
          </p>
        )}
      </article>
    </div>
  );
}
