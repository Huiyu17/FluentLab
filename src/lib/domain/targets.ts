/**
 * Which saved items a conversation should give the learner a chance to reuse (the Reuse step).
 *
 * V1 rule: items due for review first (longest overdue first), then the least mastered, skipping
 * items that are already well known. Saved items carry no scenario tags yet, so "relevant to the
 * scenario" (docs/AI_SYSTEM.md) is approximated by "most in need of practice". Deterministic:
 * the brief shows the same picks that starting the conversation (M6) will store.
 */

export const MAX_TARGETS = 3;
/** Items at or above this mastery are left for spaced review, not conversation practice. */
export const WELL_KNOWN_MASTERY = 0.8;

export type TargetCandidate = {
  id: string;
  masteryScore: number;
  nextReviewAt: string;
};

export function pickTargetItems<T extends TargetCandidate>(
  items: readonly T[],
  now: Date,
  max: number = MAX_TARGETS,
): T[] {
  const nowMs = now.getTime();
  const due = (item: T) => new Date(item.nextReviewAt).getTime() <= nowMs;

  return items
    .filter((item) => due(item) || item.masteryScore < WELL_KNOWN_MASTERY)
    .sort((a, b) => {
      const dueA = due(a);
      const dueB = due(b);
      if (dueA !== dueB) return dueA ? -1 : 1;
      if (dueA) return a.nextReviewAt.localeCompare(b.nextReviewAt) || a.id.localeCompare(b.id);
      return a.masteryScore - b.masteryScore || a.id.localeCompare(b.id);
    })
    .slice(0, max);
}
