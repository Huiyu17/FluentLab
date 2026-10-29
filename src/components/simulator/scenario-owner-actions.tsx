import { Pencil } from "lucide-react";
import Link from "next/link";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { Button } from "@/components/ui/button";
import { deleteScenarioAction } from "@/lib/actions/scenario";

/** Edit and delete controls on a learner's own scenario. */
export function ScenarioOwnerActions({ id, title }: { id: string; title: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="sm">
        <Link href={`/simulator/custom/${id}/edit`}>
          <Pencil aria-hidden />
          Edit
        </Link>
      </Button>
      <ConfirmDelete action={deleteScenarioAction} fields={{ id }} question={`Delete “${title}”?`} />
    </div>
  );
}
