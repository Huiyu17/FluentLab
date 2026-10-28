import { Construction } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "./states";

/**
 * Temporary page body for routes whose feature lands in a later milestone
 * (docs/TASKS.md). Replace when the milestone is implemented.
 */
export function PlaceholderPage({
  title,
  description,
  milestone,
  comingNext,
}: {
  title: string;
  description: string;
  milestone: string;
  comingNext: string;
}) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={
          <Badge variant="outline" className="rounded-full bg-card">
            Coming in {milestone}
          </Badge>
        }
      />
      <EmptyState icon={<Construction className="size-5" />} title="Not built yet" description={comingNext} />
    </>
  );
}
