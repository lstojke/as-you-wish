import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { actions, isInputError } from "astro:actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/components/hooks/useT";
import type { useSettingsMutation } from "@/components/hooks/useSettingsMutation";
import ImportantDateDialog from "@/components/settings/ImportantDateDialog";
import DeleteImportantDateDialog from "@/components/settings/DeleteImportantDateDialog";
import { formatCalendarDate, sortImportantDates } from "@/lib/important-dates";
import { DEFAULT_REPEAT_FREQUENCY, repeatFrequencySchema } from "@/lib/schemas/important-dates";
import type { ImportantDate, ImportantDateCreateInput, ImportantDateFormValues } from "@/types";

interface Props {
  initialDates: ImportantDate[];
  form: UseFormReturn<ImportantDateFormValues, unknown, ImportantDateCreateInput>;
  mutation: ReturnType<typeof useSettingsMutation>;
}

export default function ImportantDatesSection({ initialDates, form, mutation }: Props) {
  const { locale, t } = useT();
  const [dates, setDates] = useState(initialDates);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ImportantDate | null>(null);
  const [deleting, setDeleting] = useState<ImportantDate | null>(null);

  function closeEditor() {
    setOpen(false);
    setEditing(null);
    form.reset({ date: "", heading: "", description: "", repeatFrequency: DEFAULT_REPEAT_FREQUENCY });
  }

  function openEditor(entry: ImportantDate | null) {
    form.reset({
      date: entry?.date ?? "",
      heading: entry?.heading ?? "",
      description: entry?.description ?? "",
      repeatFrequency: entry ? repeatFrequencySchema.parse(entry.repeat_frequency) : DEFAULT_REPEAT_FREQUENCY,
    });
    setEditing(entry);
    setOpen(true);
  }

  async function saveDate(values: ImportantDateCreateInput) {
    if (!mutation.start()) {
      toast.error(t("settingsForm.busy"));
      return;
    }
    try {
      const { data, error } = editing
        ? await actions.importantDates.update({ ...values, importantDateId: editing.id })
        : await actions.importantDates.create(values);
      if (error) {
        if (isInputError(error)) {
          for (const name of ["date", "heading", "description", "repeatFrequency"] as const) {
            const message = error.fields[name]?.[0];
            if (message) form.setError(name, { message });
          }
          toast.error(t("errors.importantDateSave"));
        } else {
          toast.error(error.message || t("errors.importantDateSave"));
        }
        return;
      }
      setDates((previous) => sortImportantDates([...previous.filter((entry) => entry.id !== data.id), data]));
      closeEditor();
      toast.success(t("importantDates.saved"));
    } catch {
      toast.error(t("errors.importantDateSave"));
    } finally {
      mutation.finish();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("importantDates.heading")}</h2>
        </CardTitle>
        <CardDescription>{t("importantDates.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{t("importantDates.repeatHelp")}</p>
        <Button
          type="button"
          disabled={mutation.busy}
          onClick={() => {
            openEditor(null);
          }}
        >
          {t("importantDates.add")}
        </Button>
        {dates.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("importantDates.empty")}</p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">{t("importantDates.order")}</p>
            <ul className="space-y-3">
              {dates.map((entry) => (
                <li key={entry.id} className="space-y-3 rounded-lg border p-4">
                  <h3 className="font-medium break-words">{entry.heading}</h3>
                  <p className="text-muted-foreground text-sm">
                    <time dateTime={entry.date}>{formatCalendarDate(entry.date, locale)}</time>
                    {" · "}
                    {t(`importantDates.frequency.${repeatFrequencySchema.parse(entry.repeat_frequency)}`)}
                  </p>
                  {entry.description && <p className="text-sm break-words whitespace-pre-wrap">{entry.description}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={mutation.busy}
                      onClick={() => {
                        openEditor(entry);
                      }}
                      aria-label={t("importantDates.editNamed", { heading: entry.heading })}
                    >
                      {t("importantDates.edit")}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={mutation.busy}
                      onClick={() => {
                        setDeleting(entry);
                      }}
                      aria-label={t("importantDates.deleteNamed", { heading: entry.heading })}
                    >
                      {t("importantDates.delete")}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        <ImportantDateDialog
          open={open}
          editing={editing !== null}
          form={form}
          busy={mutation.busy}
          onClose={closeEditor}
          onSubmit={saveDate}
        />
        <DeleteImportantDateDialog
          entry={deleting}
          mutation={mutation}
          onClose={() => {
            setDeleting(null);
          }}
          onDeleted={(deleted) => {
            setDates((previous) => previous.filter((entry) => entry.id !== deleted.id));
            setDeleting(null);
          }}
        />
      </CardContent>
    </Card>
  );
}
