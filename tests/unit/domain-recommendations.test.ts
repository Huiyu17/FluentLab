import { describe, expect, it } from "vitest";
import {
  buildTodayPlan,
  gapPriority,
  pickFocusGap,
  pickScenario,
  type PlanGap,
  type PlanInput,
  type PlanScenario,
} from "@/lib/domain/recommendations";

const SCENARIOS: PlanScenario[] = [
  { slug: "office-hours", title: "Office Hours", category: "campus", estMinutes: 8 },
  { slug: "after-class-small-talk", title: "Chatting After Class", category: "campus", estMinutes: 6 },
  { slug: "coffee-shop-order", title: "Ordering at a Busy Coffee Shop", category: "everyday", estMinutes: 5 },
  { slug: "career-fair", title: "Career Fair Chat", category: "career", estMinutes: 8 },
  { slug: "my-lab-meeting", title: "My Lab Meeting", category: "custom", estMinutes: 8 },
];

const NOW = new Date("2026-10-28T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    contexts: ["campus"],
    dueReviewCount: 0,
    gaps: [],
    scenarios: SCENARIOS,
    recentScenarioSlugs: [],
    today: "2026-10-28",
    now: NOW,
    ...overrides,
  };
}

function gap(overrides: Partial<PlanGap> = {}): PlanGap {
  return {
    id: "gap-1",
    title: "Overly direct requests",
    status: "active",
    severity: "medium",
    evidenceCount: 3,
    conversationsCount: 2,
    lastDetectedAt: "2026-10-27T10:00:00Z",
    lastPracticedAt: null,
    ...overrides,
  };
}

function conversationOf(plan: ReturnType<typeof buildTodayPlan>) {
  const item = plan.find((r) => r.kind === "conversation");
  if (item?.kind !== "conversation") throw new Error("Expected a conversation recommendation");
  return item;
}

describe("buildTodayPlan", () => {
  it("orders conversation, review, studio", () => {
    expect(buildTodayPlan(input({ dueReviewCount: 4 })).map((r) => r.kind)).toEqual([
      "conversation",
      "review",
      "studio",
    ]);
  });

  it("suggests a shared scenario from the learner's contexts, never a custom one", () => {
    for (const today of ["2026-10-28", "2026-10-29", "2026-10-30", "2026-11-01"]) {
      const item = conversationOf(buildTodayPlan(input({ today })));
      expect(["office-hours", "after-class-small-talk"]).toContain(item.scenarioSlug);
      expect(item.href).toBe(`/simulator/${item.scenarioSlug}`);
      expect(item.reason).toBe("Matches where you use English: Campus.");
      expect(item.gapId).toBeNull();
    }
  });

  it("is deterministic for the same day", () => {
    expect(buildTodayPlan(input())).toEqual(buildTodayPlan(input()));
  });

  it("skips scenarios practiced recently when it can", () => {
    const item = conversationOf(buildTodayPlan(input({ recentScenarioSlugs: ["office-hours"] })));
    expect(item.scenarioSlug).toBe("after-class-small-talk");
  });

  it("falls back to the context pool when everything was practiced recently", () => {
    const item = conversationOf(
      buildTodayPlan(input({ recentScenarioSlugs: ["office-hours", "after-class-small-talk"] })),
    );
    expect(["office-hours", "after-class-small-talk"]).toContain(item.scenarioSlug);
  });

  it("uses the whole shared catalog when no scenario matches the contexts", () => {
    const item = conversationOf(buildTodayPlan(input({ contexts: ["travel"] })));
    expect(item.scenarioSlug).not.toBe("my-lab-meeting");
    expect(item.reason).toBe("A good everyday conversation to warm up with.");
  });

  it("explains the focus gap when there is one", () => {
    const item = conversationOf(buildTodayPlan(input({ gaps: [gap()] })));
    expect(item.gapId).toBe("gap-1");
    expect(item.reason).toBe('Practice "Overly direct requests": seen 3× in 2 conversations.');
    // The link opens the brief with this gap as the focus.
    expect(item.href).toBe(`/simulator/${item.scenarioSlug}?gap=gap-1`);
    const single = conversationOf(
      buildTodayPlan(input({ gaps: [gap({ evidenceCount: 1, conversationsCount: 1 })] })),
    );
    expect(single.reason).toBe('Practice "Overly direct requests": seen 1× in 1 conversation.');
  });

  it("links to the plain brief without a gap", () => {
    const item = conversationOf(buildTodayPlan(input()));
    expect(item.href).toBe(`/simulator/${item.scenarioSlug}`);
  });

  it("leaves the conversation out when there are no shared scenarios", () => {
    expect(buildTodayPlan(input({ scenarios: [] })).map((r) => r.kind)).toEqual(["studio"]);
  });

  it("adds a review only when items are due, sized by the count", () => {
    expect(buildTodayPlan(input()).some((r) => r.kind === "review")).toBe(false);

    const review = (due: number) =>
      buildTodayPlan(input({ dueReviewCount: due })).find((r) => r.kind === "review");
    expect(review(1)).toMatchObject({
      reason: "1 saved expression is due for review.",
      minutes: 3,
      href: "/my-english/review",
      dueCount: 1,
    });
    expect(review(9)).toMatchObject({ reason: "9 saved expressions are due for review.", minutes: 5 });
    expect(review(60)).toMatchObject({ minutes: 10 });
  });

  it("always ends with a Studio suggestion", () => {
    const studio = buildTodayPlan(input({ contexts: ["everyday"] })).at(-1);
    expect(studio).toMatchObject({
      kind: "studio",
      href: "/expressions",
      reason: "Add a phrase you can use in everyday life situations.",
    });
    expect(buildTodayPlan(input({ contexts: [] })).at(-1)?.reason).toBe(
      "Add a phrase you can use this week.",
    );
  });
});

describe("gapPriority", () => {
  it("is severity weight × recency decay (halving every 14 days)", () => {
    expect(gapPriority(gap({ severity: "high", lastDetectedAt: NOW.toISOString() }), NOW)).toBe(3);
    expect(gapPriority(gap({ severity: "medium", lastDetectedAt: daysAgo(14) }), NOW)).toBeCloseTo(1);
    expect(gapPriority(gap({ severity: "low", lastDetectedAt: daysAgo(28) }), NOW)).toBeCloseTo(0.25);
  });

  it("drops a gap practiced in the last 2 days, and improving gaps, but never to zero", () => {
    const base = gap({ severity: "high", lastDetectedAt: NOW.toISOString() });
    expect(gapPriority({ ...base, lastPracticedAt: daysAgo(1) }, NOW)).toBeCloseTo(0.75);
    expect(gapPriority({ ...base, lastPracticedAt: daysAgo(2.1) }, NOW)).toBe(3);
    expect(gapPriority({ ...base, status: "improving" }, NOW)).toBe(1.5);
  });
});

describe("pickFocusGap", () => {
  it("returns null without gaps and prefers the highest priority", () => {
    expect(pickFocusGap([], NOW)).toBeNull();
    expect(
      pickFocusGap(
        [
          gap({ id: "low-many", severity: "low", evidenceCount: 9 }),
          gap({ id: "high", severity: "high", evidenceCount: 2 }),
        ],
        NOW,
      )?.id,
    ).toBe("high");
  });

  it("lets a fresh medium gap beat a high one not seen for a month", () => {
    expect(
      pickFocusGap(
        [
          gap({ id: "old-high", severity: "high", lastDetectedAt: daysAgo(30) }),
          gap({ id: "fresh-medium", severity: "medium", lastDetectedAt: daysAgo(1) }),
        ],
        NOW,
      )?.id,
    ).toBe("fresh-medium");
  });

  it("moves on from a gap practiced yesterday", () => {
    expect(
      pickFocusGap(
        [
          gap({ id: "practiced", severity: "high", lastDetectedAt: daysAgo(1), lastPracticedAt: daysAgo(1) }),
          gap({ id: "other", severity: "medium", lastDetectedAt: daysAgo(1) }),
        ],
        NOW,
      )?.id,
    ).toBe("other");
  });

  it("breaks ties by evidence, then recency, then id", () => {
    const same = { lastDetectedAt: daysAgo(1) };
    expect(
      pickFocusGap(
        [gap({ ...same, id: "fewer", evidenceCount: 2 }), gap({ ...same, id: "more", evidenceCount: 5 })],
        NOW,
      )?.id,
    ).toBe("more");
    expect(pickFocusGap([gap({ ...same, id: "b" }), gap({ ...same, id: "a" })], NOW)?.id).toBe("a");
  });
});

describe("pickScenario", () => {
  it("is the plan's pick, usable on its own for 'Practice this'", () => {
    const base = {
      contexts: ["campus"] as const,
      scenarios: SCENARIOS,
      recentScenarioSlugs: ["office-hours"],
      today: "2026-10-28",
    };
    expect(pickScenario({ ...base, contexts: [...base.contexts] })?.slug).toBe("after-class-small-talk");
    expect(pickScenario({ ...base, contexts: [], scenarios: [] })).toBeNull();
  });
});
