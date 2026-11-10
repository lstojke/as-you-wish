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
import { useT } from "@/components/hooks/useT";
import type { useSettingsMutation } from "@/components/hooks/useSettingsMutation";
import type { ImportantDate } from "@/types";

interface Props {
  entry: ImportantDate | null;
  mutation: ReturnType<typeof useSettingsMutation>;
  onClose: () => void;
  onDeleted: (entry: ImportantDate) => void;
}

export default function DeleteImportantDateDialog({ entry, mutation, onClose, onDeleted }: Props) {
  const { t } = useT();

  async function handleDelete() {
    if (!entry) return;
    if (!mutation.start()) {
      toast.error(t("settingsForm.busy"));
      return;
    }
    try {
      const { data, error } = await actions.importantDates.delete({ importantDateId: entry.id });
      if (error) {
        toast.error(error.message || t("errors.importantDateDelete"));
        return;
      }
      onDeleted(data);
      toast.success(t("importantDates.deleted"));
    } catch {
      toast.error(t("errors.importantDateDelete"));
    } finally {
      mutation.finish();
    }
  }

  return (
    <AlertDialog
      open={entry !== null}
      onOpenChange={(next) => {
        if (!next && !mutation.busy) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("importantDates.deleteTitle", { heading: entry?.heading ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription>{t("importantDates.deleteDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.busy}>{t("importantDates.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={mutation.busy}
            onClick={(event) => {
              event.preventDefault();
              void handleDelete();
            }}
          >
            {mutation.busy ? t("importantDates.deleting") : t("importantDates.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
