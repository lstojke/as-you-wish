import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/components/hooks/useT";
import { REPEAT_FREQUENCIES } from "@/lib/schemas/important-dates";
import type { ImportantDateCreateInput, ImportantDateFormValues } from "@/types";

interface Props {
  open: boolean;
  editing: boolean;
  form: UseFormReturn<ImportantDateFormValues, unknown, ImportantDateCreateInput>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (values: ImportantDateCreateInput) => Promise<void>;
}

export default function ImportantDateDialog({ open, editing, form, busy, onClose, onSubmit }: Props) {
  const { t } = useT();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  function requestClose() {
    if (busy) return;
    if (form.formState.isDirty) setConfirmDiscard(true);
    else onClose();
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t(editing ? "importantDates.edit" : "importantDates.add")}</DialogTitle>
            <DialogDescription>{t("importantDates.description")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
              <fieldset disabled={busy} className="space-y-4">
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("importantDates.date")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" min="0001-01-01" max="9999-12-31" required />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="heading"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("importantDates.title")}</FormLabel>
                      <FormControl>
                        <Input {...field} maxLength={100} required />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-sm">{t("importantDates.suggestions")}</span>
                  {(["birthday", "anniversary"] as const).map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        form.setValue("heading", t(`importantDates.${suggestion}`), {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                      }}
                    >
                      {t(`importantDates.${suggestion}`)}
                    </Button>
                  ))}
                </div>
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("importantDates.notes")}</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value ?? ""} maxLength={1000} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="repeatFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("importantDates.repeat")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange} disabled={busy}>
                        <FormControl>
                          <SelectTrigger onBlur={field.onBlur} ref={field.ref}>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {REPEAT_FREQUENCIES.map((frequency) => (
                            <SelectItem key={frequency} value={frequency}>
                              {t(`importantDates.frequency.${frequency}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <p className="text-muted-foreground text-sm">{t("importantDates.repeatHelp")}</p>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                    {t("importantDates.cancel")}
                  </Button>
                  <Button type="submit" disabled={busy || (editing && !form.formState.isDirty)}>
                    {busy ? t("settingsForm.saving") : t("settingsForm.save")}
                  </Button>
                </DialogFooter>
              </fieldset>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("importantDates.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("importantDates.discardDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("importantDates.keepEditing")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirmDiscard(false);
                onClose();
              }}
            >
              {t("settingsForm.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
