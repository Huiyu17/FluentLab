import { MessagesSquare } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/shared/states";
import { getAuthState, requireOnboardedUser } from "@/lib/auth/dal";
import { listSavedItems } from "@/lib/data/items";
import { getCustomScenario, getSharedScenario, type Scenario } from "@/lib/data/scenarios";
import { pickTargetItems } from "@/lib/domain/targets";
import { ScenarioBrief } from "./scenario-brief";

type Source = { kind: "shared"; slug: string } | { kind: "custom"; id: string };

/**
 * Page body for /simulator/[scenarioSlug] and /simulator/custom/[id]. `actions` renders owner
 * controls for a custom scenario once it is loaded.
 */
export async function BriefPage({
  source,
  actions,
}: {
  source: Source;
  actions?: (scenario: Scenario) => ReactNode;
}) {
  const auth = await getAuthState();
  if (auth.status === "unconfigured") {
    return (
      <EmptyState
        icon={<MessagesSquare className="size-5" />}
        title="Scenarios need an account"
        description="Supabase is not configured, so this scenario can't be loaded yet."
      />
    );
  }

  const path = source.kind === "shared" ? `/simulator/${source.slug}` : `/simulator/custom/${source.id}`;
  const { user } = await requireOnboardedUser(path);
  const [scenario, items] = await Promise.all([
    source.kind === "shared" ? getSharedScenario(source.slug) : getCustomScenario(user.id, source.id),
    listSavedItems(user.id),
  ]);
  if (!scenario) notFound();

  const targets = pickTargetItems(items ?? [], new Date());
  return <ScenarioBrief scenario={scenario} targets={targets} actions={actions?.(scenario)} />;
}
