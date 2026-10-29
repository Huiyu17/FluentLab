import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { deleteItemAction } from "@/lib/actions/studio";

export function DeleteItemButton({
  itemId,
  expression,
  back,
}: {
  itemId: string;
  expression: string;
  back: string;
}) {
  return (
    <ConfirmDelete
      action={deleteItemAction}
      fields={{ itemId, back }}
      question={`Delete “${expression}” and its review history?`}
    />
  );
}
