import { describe, expect, it } from "vitest";
import { recomputeGap, type EventType, type GapEvent, type GapInput } from "@/lib/domain/gaps";
import { GAP_DETAILS, GAP_SUB_CATEGORIES } from "@/lib/domain/taxonomy";

const NOW = new Date("2026-10-29T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

function event(
  daysBefore: number,
  overrides: Partial<Omit<GapEvent, "createdAt">> & { eventType?: EventType } = {},
): GapEvent {
  return {
    eventType: "overly_direct",
    confidence: 0.7,
    conversationId: "c1",
    ...overrides,
    createdAt: daysAgo(daysBefore),
  };
}
const good = (daysBefore: number, conversationId = "c9") =>
  event(daysBefore, { eventType: "good_usage", conversationId });

function gap(events: GapEvent[], overrides: Partial<GapInput> = {}) {
  return recomputeGap({
    events,
    targetedCompletions: [],
    dismissed: false,
    previousSeverity: "low",
    now: NOW,
    ...overrides,
  });
}

describe("evidence and aggregates", () => {
  it("counts only negative events with confidence ≥ 0.6", () => {
    const state = gap([
      event(1, { confidence: 0.59 }),
      event(2, { confidence: 0.6, conversationId: "c1" }),
      event(3, { confidence: 0.8, conversationId: "c2" }),
      good(1),
    ]);
    expect(state).toMatchObject({ evidenceCount: 2, conversationsCount: 2, confidence: 0.8 });
    expect(state.firstDetectedAt).toEqual(daysAgo(3));
    expect(state.lastDetectedAt).toEqual(daysAgo(2));
  });

  it("has empty aggregates without negative evidence", () => {
    expect(gap([good(1), event(1, { confidence: 0.3 })])).toEqual({
      status: "emerging",
      severity: "low",
      evidenceCount: 0,
      conversationsCount: 0,
      confidence: 0,
      firstDetectedAt: null,
      lastDetectedAt: null,
    });
  });

  it("doesn't depend on event order", () => {
    const events = [event(5, { conversationId: "a" }), good(3), event(1, { conversationId: "b" }), good(2)];
    expect(gap(events)).toEqual(gap([...events].reverse()));
  });
});

describe("status", () => {
  it("stays emerging with one ordinary event", () => {
    expect(gap([event(1)]).status).toBe("emerging");
  });

  it("becomes active with two negative events, or one at ≥ 0.85", () => {
    expect(gap([event(2), event(1)]).status).toBe("active");
    expect(gap([event(1, { confidence: 0.85 })]).status).toBe("active");
    expect(gap([event(1, { confidence: 0.84 })]).status).toBe("emerging");
  });

  it("becomes improving after two good usages since the last negative event", () => {
    expect(gap([event(5), event(4), good(3)]).status).toBe("active");
    expect(gap([event(5), event(4), good(3), good(2)]).status).toBe("improving");
    // Good usages before the last negative event don't count.
    expect(gap([good(6), good(5), event(4), event(3)]).status).toBe("active");
  });

  it("becomes improving after three targeted conversations since the last negative event", () => {
    const events = [event(10), event(9)];
    expect(gap(events, { targetedCompletions: [daysAgo(8), daysAgo(7)] }).status).toBe("active");
    expect(gap(events, { targetedCompletions: [daysAgo(8), daysAgo(7), daysAgo(1)] }).status).toBe(
      "improving",
    );
    expect(gap(events, { targetedCompletions: [daysAgo(12), daysAgo(8), daysAgo(7)] }).status).toBe("active");
  });

  it("goes back to active on new negative evidence", () => {
    expect(gap([event(5), event(4), good(3), good(2), event(1)]).status).toBe("active");
  });

  it("is resolved after 30 days without negative evidence, and reopens on new evidence", () => {
    const history = [event(40), event(35), good(31), good(30)];
    expect(gap(history).status).toBe("resolved");
    expect(gap([event(40), event(29), good(28), good(27)]).status).toBe("improving");
    expect(gap([...history, event(1)]).status).toBe("active");
  });

  it("needs improving before resolved: 30 quiet days alone keep it active", () => {
    expect(gap([event(60), event(50)]).status).toBe("active");
  });

  it("keeps a dismissed gap dismissed, with its severity", () => {
    const state = gap([event(1), event(1), event(1), event(1)], { dismissed: true, previousSeverity: "low" });
    expect(state).toMatchObject({ status: "dismissed", severity: "low", evidenceCount: 4 });
  });
});

describe("severity", () => {
  const n = (count: number, daysBefore = 1, conversationId = "c1") =>
    Array.from({ length: count }, () => event(daysBefore, { conversationId }));

  it("is low for 1–3, medium for 4–6 and high for 7+ events in the last 14 days", () => {
    expect(gap(n(1, 1)).severity).toBe("low");
    expect(gap(n(3)).severity).toBe("low");
    expect(gap(n(4)).severity).toBe("medium");
    expect(gap(n(6)).severity).toBe("medium");
    expect(gap(n(7)).severity).toBe("high");
  });

  it("is high when the evidence spans 3 conversations in the window", () => {
    expect(
      gap([
        event(1, { conversationId: "a" }),
        event(2, { conversationId: "b" }),
        event(3, { conversationId: "c" }),
      ]).severity,
    ).toBe("high");
  });

  it("starts low for a gap activated by one high-confidence event", () => {
    expect(gap([event(1, { confidence: 0.95 })])).toMatchObject({ status: "active", severity: "low" });
  });

  it("only counts the window and keeps the previous severity without recent evidence", () => {
    expect(gap([...n(7, 20), event(1)]).severity).toBe("low");
    expect(gap(n(7, 15), { previousSeverity: "high" }).severity).toBe("high");
    expect(gap(n(7, 15), { previousSeverity: "medium" }).severity).toBe("medium");
    expect(gap(n(2, 14)).severity).toBe("low");
  });
});

describe("GAP_DETAILS", () => {
  it("has a title and description for every sub-category", () => {
    for (const sub of GAP_SUB_CATEGORIES) {
      expect(GAP_DETAILS[sub].title.length).toBeGreaterThan(0);
      expect(GAP_DETAILS[sub].description.length).toBeGreaterThan(0);
    }
  });
});
