import { Clock } from "lucide-react";
import Link from "next/link";
import type { Scenario } from "@/lib/data/scenarios";
import { SCENARIO_CATEGORY_LABELS, scenarioHref } from "@/lib/scenarios";
import { ENGLISH_LEVEL_LABELS } from "@/lib/validation/profile";

/** A catalog entry linking to the scenario brief. */
export function ScenarioCard({ scenario }: { scenario: Scenario }) {
  return (
    <Link
      href={scenarioHref(scenario)}
      className="group flex h-full flex-col gap-3 rounded-2xl border bg-card p-5 transition-colors duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {SCENARIO_CATEGORY_LABELS[scenario.category]}
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-semibold">{scenario.title}</span>
        {scenario.description && (
          <span className="line-clamp-2 text-sm text-muted-foreground">{scenario.description}</span>
        )}
      </span>
      <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
        <span>{ENGLISH_LEVEL_LABELS[scenario.difficulty].label}</span>
        <span aria-hidden>·</span>
        <span className="flex items-center gap-1">
          <Clock aria-hidden className="size-3.5" />
          {scenario.estMinutes} min
        </span>
      </span>
    </Link>
  );
}

export function ScenarioGrid({ scenarios }: { scenarios: Scenario[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {scenarios.map((scenario) => (
        <li key={scenario.id}>
          <ScenarioCard scenario={scenario} />
        </li>
      ))}
    </ul>
  );
}
