/**
 * Gap detection: deterministic rules over language events (docs/AI_SYSTEM.md → Gap detection).
 *
 * A gap's aggregates and status are a pure function of its linked events, the conversations that
 * targeted it and the current time, so re-applying a review gives the same result ("recompute,
 * don't increment"). The only inputs that carry history are `dismissed` (user-set, sticky) and the
 * previous severity, which is kept when there is no evidence in the severity window.
 *
 * apply_conversation_review (SQL) is the authoritative implementation; this mirror is what the
 * unit tests describe, and tests/db/gaps.test.ts checks that both agree.
 */
import type { GapSeverity } from "./recommendations";

export const EVENT_TYPES = [
  "unnatural_expression",
  "grammar_error",
  "overly_direct",
  "register_mismatch",
  "limited_vocabulary",
  "missed_opportunity",
  "good_usage",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const GAP_STATUSES = ["emerging", "active", "improving", "resolved", "dismissed"] as const;
export type GapStatus = (typeof GAP_STATUSES)[number];
/** Statuses listed in the Gap Tracker (dismissed ones separately); `emerging` stays hidden everywhere. */
export const TRACKER_GAP_STATUSES = [
  "active",
  "improving",
  "resolved",
] as const satisfies readonly GapStatus[];

/** Events below this confidence are stored but don't count as evidence. */
export const EVIDENCE_MIN_CONFIDENCE = 0.6;
/** emerging → active: this many negative events… */
export const ACTIVATE_MIN_EVIDENCE = 2;
/** …or a single negative event at least this confident. */
export const ACTIVATE_SINGLE_CONFIDENCE = 0.85;
/** active → improving: since the last negative event, this many good usages… */
export const IMPROVING_GOOD_USAGES = 2;
/** …or this many completed conversations that targeted the gap. */
export const IMPROVING_TARGETED_CONVERSATIONS = 3;
/** improving → resolved after this long without negative evidence. */
export const RESOLVE_AFTER_DAYS = 30;
/** Severity looks at negative evidence in this window. */
export const SEVERITY_WINDOW_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type GapEvent = {
  eventType: EventType;
  confidence: number;
  conversationId: string;
  createdAt: Date;
};

export type GapInput = {
  /** Every event linked to the gap, of any confidence. */
  events: readonly GapEvent[];
  /** When each completed conversation that targeted this gap was completed (M9 creates these). */
  targetedCompletions: readonly Date[];
  /** The learner dismissed it: status stays `dismissed` whatever the evidence says. */
  dismissed: boolean;
  /** Severity before this recompute; kept when there is no evidence in the window. */
  previousSeverity: GapSeverity;
  now: Date;
};

export type GapState = {
  status: GapStatus;
  severity: GapSeverity;
  /** Negative evidence events (confidence ≥ 0.6), all time. */
  evidenceCount: number;
  /** Distinct conversations among them. */
  conversationsCount: number;
  /** Highest confidence among negative evidence (0 without any). */
  confidence: number;
  firstDetectedAt: Date | null;
  lastDetectedAt: Date | null;
};

function isEvidence(event: GapEvent): boolean {
  return event.confidence >= EVIDENCE_MIN_CONFIDENCE;
}

function latest(dates: Date[]): Date | null {
  return dates.length === 0 ? null : new Date(Math.max(...dates.map((d) => d.getTime())));
}

function earliest(dates: Date[]): Date | null {
  return dates.length === 0 ? null : new Date(Math.min(...dates.map((d) => d.getTime())));
}

/** Severity from negative evidence in the window, or the previous severity if there is none. */
export function gapSeverity(negative: readonly GapEvent[], previous: GapSeverity, now: Date): GapSeverity {
  const since = now.getTime() - SEVERITY_WINDOW_DAYS * DAY_MS;
  const recent = negative.filter((e) => e.createdAt.getTime() >= since);
  if (recent.length === 0) return previous;
  const conversations = new Set(recent.map((e) => e.conversationId)).size;
  if (recent.length >= 7 || conversations >= 3) return "high";
  if (recent.length >= 4) return "medium";
  return "low";
}

/** Status from the full history (see the module comment for why this needs no previous status). */
export function gapStatus(
  negative: readonly GapEvent[],
  positive: readonly GapEvent[],
  targetedCompletions: readonly Date[],
  dismissed: boolean,
  now: Date,
): GapStatus {
  if (dismissed) return "dismissed";
  // Evidence only accumulates, so "was ever activated" is a property of the whole history, and a
  // resolved or improving gap reopens as active on new negative evidence.
  const activated =
    negative.length >= ACTIVATE_MIN_EVIDENCE ||
    negative.some((e) => e.confidence >= ACTIVATE_SINGLE_CONFIDENCE);
  if (!activated) return "emerging";

  const lastNegative = latest(negative.map((e) => e.createdAt))!;
  const goodSince = positive.filter((e) => e.createdAt > lastNegative).length;
  const targetedSince = targetedCompletions.filter((d) => d > lastNegative).length;
  const improving = goodSince >= IMPROVING_GOOD_USAGES || targetedSince >= IMPROVING_TARGETED_CONVERSATIONS;
  if (!improving) return "active";

  return now.getTime() - lastNegative.getTime() >= RESOLVE_AFTER_DAYS * DAY_MS ? "resolved" : "improving";
}

/** Recomputes a gap from its events (docs/AI_SYSTEM.md → Gap detection, steps 3–5). */
export function recomputeGap(input: GapInput): GapState {
  const evidence = input.events.filter(isEvidence);
  const negative = evidence.filter((e) => e.eventType !== "good_usage");
  const positive = evidence.filter((e) => e.eventType === "good_usage");
  const dates = negative.map((e) => e.createdAt);

  return {
    status: gapStatus(negative, positive, input.targetedCompletions, input.dismissed, input.now),
    severity: input.dismissed
      ? input.previousSeverity
      : gapSeverity(negative, input.previousSeverity, input.now),
    evidenceCount: negative.length,
    conversationsCount: new Set(negative.map((e) => e.conversationId)).size,
    confidence: negative.reduce((max, e) => Math.max(max, e.confidence), 0),
    firstDetectedAt: earliest(dates),
    lastDetectedAt: latest(dates),
  };
}

/** How a gap's status reads to the learner. `emerging` is "Watching": noticed, not yet a pattern. */
export const GAP_STATUS_LABELS: Record<GapStatus, string> = {
  emerging: "Watching",
  active: "Focus area",
  improving: "Improving",
  resolved: "Resolved",
  dismissed: "Dismissed",
};
