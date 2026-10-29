import type { CustomScenarioField } from "@/lib/validation/scenario";

export type ScenarioFormState =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: Partial<Record<CustomScenarioField, string>> };

export const IDLE_SCENARIO_STATE: ScenarioFormState = { status: "idle" };
