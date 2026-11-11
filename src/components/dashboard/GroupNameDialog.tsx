import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { actions, isInputError } from "astro:actions";
import { toast } from "sonner";
import { useT } from "@/components/hooks/useT";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { PersonalListGroup } from "@/components/dashboard/group-types";
import { listGroupCreateSchema as schema, LIST_GROUP_NAME_MAX } from "@/lib/schemas/list-groups";

interface Props {
  open: boolean;
  group: PersonalListGroup | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (group: PersonalListGroup) => void;
}

export default function GroupNameDialog({ open, group, onOpenChange, onSaved }: Props) {
  const { t, tm } = useT();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "" },
  });
  useEffect(() => {
    form.reset({ name: open ? (group?.name ?? "") : "" });
  }, [open, group, form]);

  async function onSubmit({ name }: z.infer<typeof schema>) {
    try {
      const { data, error } = group
        ? await actions.listGroups.rename({ groupId: group.id, name })
        : await actions.listGroups.create({ name });
      if (error) {
        if (isInputError(error)) {
          form.setError("name", { message: tm(error.fields.name?.[0] ?? "validation.inputInvalid") });
        } else {
          toast.error(error.message || t("listGroups.saveError"));
        }
        return;
      }
      onSaved(data);
      onOpenChange(false);
      toast.success(t("listGroups.saved"));
    } catch {
      toast.error(t("listGroups.saveError"));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!form.formState.isSubmitting) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(group ? "listGroups.rename" : "listGroups.create")}</DialogTitle>
          <DialogDescription>{t("listGroups.privacy")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("listGroups.name")}</FormLabel>
                  <FormControl>
                    <Input autoFocus autoComplete="off" maxLength={LIST_GROUP_NAME_MAX} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={form.formState.isSubmitting}
                onClick={() => {
                  onOpenChange(false);
                }}
              >
                {t("dashboardLists.cancel")}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {t(form.formState.isSubmitting ? "dashboardLists.saving" : "dashboardLists.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
