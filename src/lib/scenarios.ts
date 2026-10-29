import type { Scenario } from "@/lib/data/scenarios";
import { LEARNING_CONTEXTS, LEARNING_CONTEXT_LABELS, type LearningContext } from "@/lib/validation/profile";
import type { ScenarioCategory } from "@/lib/validation/scenario";

export const SCENARIO_CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  ...Object.fromEntries(LEARNING_CONTEXTS.map((c) => [c, LEARNING_CONTEXT_LABELS[c].label])),
  custom: "Custom",
} as Record<ScenarioCategory, string>;

/** Where a scenario's brief lives: shared scenarios by slug, custom ones by id. */
export function scenarioHref(scenario: Pick<Scenario, "id" | "slug" | "isCustom">): string {
  return scenario.isCustom || !scenario.slug
    ? `/simulator/custom/${scenario.id}`
    : `/simulator/${scenario.slug}`;
}

export type ScenarioGroup = { category: LearningContext; scenarios: Scenario[] };

/**
 * Catalog layout: shared scenarios in the learner's contexts come first as "recommended";
 * the rest are grouped by category in the usual context order. Nothing appears twice.
 */
export function groupScenarios(
  shared: readonly Scenario[],
  contexts: readonly LearningContext[],
): { recommended: Scenario[]; groups: ScenarioGroup[] } {
  const inContexts = (s: Scenario) => contexts.includes(s.category as LearningContext);
  const recommended = shared.filter(inContexts);
  const rest = shared.filter((s) => !inContexts(s));
  const groups = LEARNING_CONTEXTS.map((category) => ({
    category,
    scenarios: rest.filter((s) => s.category === category),
  })).filter((group) => group.scenarios.length > 0);
  return { recommended, groups };
}
