/**
 * Spaced repetition, "SM-2 lite".
 *
 * The database is authoritative: `record_item_review()` (supabase/migrations/*_record_item_review.sql)
 * applies these exact rules inside one transaction, so learners can't write their own schedule.
 * This TypeScript mirror is for previews ("Good · 3 days") and tests; tests/db/scheduling.test.ts
 * checks that both give identical results.
 *
 * Rules (ease and mastery are rounded to 2 decimals, intervals are whole days, capped at 365):
 * - again: interval 0 and due again in 10 minutes; ease −0.20 (min 1.3); mastery −0.20
 * - hard:  interval max(1, round(interval × 1.2)); ease −0.15 (min 1.3); mastery +0.05
 * - good:  interval 0 → 1, 1 → 3, else round(interval × ease); ease unchanged; mastery +0.10
 * - easy:  interval max(good + 1, 0 → 3 else round(interval × ease × 1.3)); ease +0.15 (max 5); mastery +0.15
 * Mastery stays within 0–1.
 */

export const REVIEW_RATINGS = ["again", "hard", "good", "easy"] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

export type ScheduleState = {
  ease: number;
  intervalDays: number;
  masteryScore: number;
};

export type ScheduleResult = ScheduleState & { nextReviewAt: Date };

export const MIN_EASE = 1.3;
export const MAX_EASE = 5;
export const MAX_INTERVAL_DAYS = 365;
export const AGAIN_DELAY_MINUTES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// Ease and mastery are handled in integer hundredths so rounding matches Postgres `numeric`
// exactly (in floating point, 10 × 1.45 is 14.4999…, which would round the other way).
const hundredths = (value: number) => Math.round(value * 100);

function goodInterval(easeH: number, intervalDays: number): number {
  if (intervalDays === 0) return 1;
  if (intervalDays === 1) return 3;
  return Math.round((intervalDays * easeH) / 100);
}

export function scheduleReview(state: ScheduleState, rating: ReviewRating, now: Date): ScheduleResult {
  const easeH = hundredths(state.ease);
  const masteryH = hundredths(state.masteryScore);
  const { intervalDays } = state;
  let nextEaseH = easeH;
  let nextInterval: number;
  let masteryDeltaH: number;

  switch (rating) {
    case "again":
      nextInterval = 0;
      nextEaseH = easeH - 20;
      masteryDeltaH = -20;
      break;
    case "hard":
      nextInterval = Math.max(1, Math.round((intervalDays * 12) / 10));
      nextEaseH = easeH - 15;
      masteryDeltaH = 5;
      break;
    case "good":
      nextInterval = goodInterval(easeH, intervalDays);
      masteryDeltaH = 10;
      break;
    case "easy":
      nextInterval = Math.max(
        goodInterval(easeH, intervalDays) + 1,
        intervalDays === 0 ? 3 : Math.round((intervalDays * easeH * 13) / 1000),
      );
      nextEaseH = easeH + 15;
      masteryDeltaH = 15;
      break;
  }

  nextInterval = Math.min(nextInterval, MAX_INTERVAL_DAYS);
  const nextReviewAt = new Date(
    now.getTime() + (rating === "again" ? AGAIN_DELAY_MINUTES * 60 * 1000 : nextInterval * DAY_MS),
  );

  return {
    ease: clamp(nextEaseH, MIN_EASE * 100, MAX_EASE * 100) / 100,
    intervalDays: nextInterval,
    masteryScore: clamp(masteryH + masteryDeltaH, 0, 100) / 100,
    nextReviewAt,
  };
}

/** Short label for a rating button: "10 min", "1 day", "3 days", "2 mo". */
export function intervalLabel(state: ScheduleState, rating: ReviewRating): string {
  if (rating === "again") return `${AGAIN_DELAY_MINUTES} min`;
  const days = scheduleReview(state, rating, new Date(0)).intervalDays;
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} mo`;
  return "1 yr";
}
