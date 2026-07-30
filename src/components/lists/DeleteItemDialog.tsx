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
import type { ItemRow } from "@/lib/services/items";

interface Props {
  item: ItemRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Called immediately before the server action. Return a rollback function
  // if the parent removed the row optimistically; it will run on action error.
  onOptimisticDelete?: () => (() => void) | undefined;
  onDeleted: () => void;
}

export default function DeleteItemDialog({ item, open, onOpenChange, onOptimisticDelete, onDeleted }: Props) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm(e: React.MouseEvent<HTMLButtonElement>) {
    if (!item) return;
    e.preventDefault();
    setSubmitting(true);
    const rollback = onOptimisticDelete?.() ?? undefined;
    const { error } = await actions.items.delete({ itemId: item.id });
    setSubmitting(false);

    if (error) {
      if (typeof rollback === "function") rollback();
      toast.error(error.message || "Could not delete item");
      return;
    }

    onDeleted();
    onOpenChange(false);
    toast.success("Item deleted");
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{item?.title ?? "this item"}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
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
