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
import { useT } from "@/components/hooks/useT";

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
  const { t } = useT();
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
      toast.error(error.message || t("errors.itemDelete"));
      return;
    }

    onDeleted();
    onOpenChange(false);
    toast.success(t("itemForm.deleted"));
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("itemForm.deleteTitle", { title: item?.title ?? t("itemForm.thisItem") })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("itemForm.deleteDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>{t("itemForm.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={submitting} onClick={handleConfirm}>
            {submitting ? t("itemForm.deleting") : t("itemForm.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
