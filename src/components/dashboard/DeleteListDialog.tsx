import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ListRow } from "@/lib/services/lists";

interface Props {
  list: ListRow | null;
  itemCount?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called immediately before the server action. Return a rollback function
  // if the parent removed the row optimistically; it will run on action error.
  onOptimisticDelete?: () => (() => void) | undefined;
  onDeleted: () => void;
}

function describeImpact(itemCount: number | undefined): string {
  if (itemCount === undefined) return "This action cannot be undone.";
  if (itemCount === 0) return "This list has no items. This action cannot be undone.";
  const noun = itemCount === 1 ? "item" : "items";
  return `This will also delete ${itemCount} ${noun}. This cannot be undone.`;
}

export default function DeleteListDialog({
  list,
  itemCount,
  open,
  onOpenChange,
  onOptimisticDelete,
  onDeleted,
}: Props) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm(e: React.MouseEvent<HTMLButtonElement>) {
    if (!list) return;
    e.preventDefault();
    setSubmitting(true);
    const rollback = onOptimisticDelete?.() ?? undefined;
    const { error } = await actions.lists.delete({ listId: list.id });
    setSubmitting(false);

    if (error) {
      if (typeof rollback === "function") rollback();
      toast.error(error.message || "Could not delete list");
      return;
    }

    onDeleted();
    onOpenChange(false);
    toast.success("List deleted");
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{list?.title ?? "this list"}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>{describeImpact(itemCount)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={submitting} onClick={handleConfirm}>
            {submitting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
