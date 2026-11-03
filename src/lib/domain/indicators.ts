/**
 * Fluency Profile trends (M9): deterministic summaries of the AI-estimated learning indicators
 * stored with each conversation review. Not an assessment: a direction over the learner's own
 * recent conversations.
 */
import type { ScoreDimension } from "./taxonomy";

/** Recent window: the latest reviews compared with everything before them. */
export const RECENT_REVIEWS = 3;
/** Changes smaller than this (on 0–100) read as "steady". */
export const STEADY_BAND = 2;

export type IndicatorPoint = { at: string; scores: Record<ScoreDimension, number> };

export type IndicatorTrend =
  | { kind: "not_enough"; latest: number | null }
  | {
      kind: "up" | "down" | "steady";
      latest: number;
      recentAverage: number;
      earlierAverage: number;
      change: number;
    };

const average = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * Average of the last 3 reviews vs the average of all earlier ones (rounded). Needs at least one
 * review before the recent window, so a learner with ≤ 3 reviews sees their latest value only.
 */
export function indicatorTrend(values: readonly number[]): IndicatorTrend {
  const latest = values.at(-1) ?? null;
  if (values.length <= RECENT_REVIEWS) return { kind: "not_enough", latest };
  const recentAverage = Math.round(average(values.slice(-RECENT_REVIEWS)));
  const earlierAverage = Math.round(average(values.slice(0, -RECENT_REVIEWS)));
  const change = recentAverage - earlierAverage;
  const kind = Math.abs(change) < STEADY_BAND ? "steady" : change > 0 ? "up" : "down";
  return { kind, latest: latest!, recentAverage, earlierAverage, change };
}
