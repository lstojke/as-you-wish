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
import { useT } from "@/components/hooks/useT";

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

function describeImpact(itemCount: number | undefined, t: ReturnType<typeof useT>["t"]): string {
  if (itemCount === undefined) return t("dashboardLists.deleteListUnknownCount");
  if (itemCount === 0) return t("dashboardLists.deleteListNoItems");
  return t("dashboardLists.deleteListWithItems", { count: itemCount });
}

export default function DeleteListDialog({
  list,
  itemCount,
  open,
  onOpenChange,
  onOptimisticDelete,
  onDeleted,
}: Props) {
  const { t } = useT();
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
      toast.error(error.message || t("errors.listDelete"));
      return;
    }

    onDeleted();
    onOpenChange(false);
    toast.success(t("dashboardLists.deleted"));
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("dashboardLists.deleteTitle", { title: list?.title ?? t("dashboardLists.thisList") })}
          </AlertDialogTitle>
          <AlertDialogDescription>{describeImpact(itemCount, t)}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>{t("dashboardLists.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={submitting} onClick={handleConfirm}>
            {submitting ? t("dashboardLists.deleting") : t("dashboardLists.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
