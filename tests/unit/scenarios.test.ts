import { describe, expect, it } from "vitest";
import type { Scenario } from "@/lib/data/scenarios";
import { SCENARIO_CATEGORY_LABELS, groupScenarios, scenarioHref } from "@/lib/scenarios";

function scenario(slug: string, category: Scenario["category"]): Scenario {
  return {
    id: `id-${slug}`,
    slug,
    category,
    title: slug,
    description: "",
    userRole: "me",
    aiRole: "them",
    aiPersonality: "",
    goal: "goal",
    difficulty: "intermediate",
    openingLine: null,
    estMinutes: 8,
    isCustom: false,
  };
}

const SHARED = [
  scenario("airport-rebooking", "travel"),
  scenario("office-hours", "campus"),
  scenario("career-fair", "career"),
  scenario("coffee-shop-order", "everyday"),
  scenario("party-introductions", "social"),
  scenario("after-class-small-talk", "campus"),
];

const slugs = (list: Scenario[]) => list.map((s) => s.slug);

describe("groupScenarios", () => {
  it("puts the learner's contexts first and groups the rest in context order, without repeats", () => {
    const { recommended, groups } = groupScenarios(SHARED, ["campus", "career"]);
    expect(slugs(recommended)).toEqual(["office-hours", "career-fair", "after-class-small-talk"]);
    expect(groups.map((g) => [g.category, slugs(g.scenarios)])).toEqual([
      ["social", ["party-introductions"]],
      ["everyday", ["coffee-shop-order"]],
      ["travel", ["airport-rebooking"]],
    ]);
  });

  it("recommends nothing without contexts and skips empty categories", () => {
    const { recommended, groups } = groupScenarios([scenario("office-hours", "campus")], []);
    expect(recommended).toEqual([]);
    expect(groups.map((g) => g.category)).toEqual(["campus"]);
  });

  it("never lists a custom scenario among shared groups", () => {
    const custom = { ...scenario("x", "custom"), slug: null, isCustom: true };
    const { recommended, groups } = groupScenarios([custom], ["campus"]);
    expect(recommended).toEqual([]);
    expect(groups).toEqual([]);
  });
});

describe("scenario helpers", () => {
  it("link shared scenarios by slug and custom ones by id", () => {
    expect(scenarioHref({ id: "a", slug: "office-hours", isCustom: false })).toBe("/simulator/office-hours");
    expect(scenarioHref({ id: "a", slug: null, isCustom: true })).toBe("/simulator/custom/a");
  });

  it("label every category", () => {
    expect(SCENARIO_CATEGORY_LABELS).toEqual({
      campus: "Campus",
      social: "Social",
      everyday: "Everyday life",
      career: "Career",
      travel: "Travel",
      custom: "Custom",
    });
  });
});
