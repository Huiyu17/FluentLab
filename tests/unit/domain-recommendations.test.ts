import { describe, expect, it } from "vitest";
import {
  buildTodayPlan,
  pickFocusGap,
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

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    contexts: ["campus"],
    dueReviewCount: 0,
    gaps: [],
    scenarios: SCENARIOS,
    recentScenarioSlugs: [],
    today: "2026-10-28",
    ...overrides,
  };
}

function gap(overrides: Partial<PlanGap> = {}): PlanGap {
  return {
    id: "gap-1",
    title: "Overly direct requests",
    severity: "medium",
    evidenceCount: 3,
    lastDetectedAt: "2026-10-27T10:00:00Z",
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
    expect(item.reason).toBe('Practice "Overly direct requests": seen 3× in your conversations.');
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

describe("pickFocusGap", () => {
  it("prefers severity, then evidence, then recency", () => {
    expect(pickFocusGap([])).toBeNull();
    expect(
      pickFocusGap([
        gap({ id: "low-many", severity: "low", evidenceCount: 9 }),
        gap({ id: "high", severity: "high", evidenceCount: 2 }),
      ])?.id,
    ).toBe("high");
    expect(
      pickFocusGap([gap({ id: "fewer", evidenceCount: 2 }), gap({ id: "more", evidenceCount: 5 })])?.id,
    ).toBe("more");
    expect(
      pickFocusGap([
        gap({ id: "older", lastDetectedAt: "2026-10-20T00:00:00Z" }),
        gap({ id: "newer", lastDetectedAt: "2026-10-27T00:00:00Z" }),
      ])?.id,
    ).toBe("newer");
  });
});
