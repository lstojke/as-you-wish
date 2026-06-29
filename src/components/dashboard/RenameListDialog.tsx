import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { actions, isInputError } from "astro:actions";
import { toast } from "sonner";
import { z } from "zod";

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
import { listRenameSchema } from "@/lib/schemas/wishlist";
import type { ListRow } from "@/lib/services/lists";

const renameFormSchema = listRenameSchema.pick({ title: true });
type RenameFormValues = z.infer<typeof renameFormSchema>;

interface Props {
  list: ListRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRenamed: (updated: ListRow) => void;
}

export default function RenameListDialog({ list, open, onOpenChange, onRenamed }: Props) {
  const form = useForm<RenameFormValues>({
    resolver: zodResolver(renameFormSchema),
    defaultValues: { title: list?.title ?? "" },
  });

  useEffect(() => {
    if (open && list) {
      form.reset({ title: list.title });
    }
    if (!open) {
      form.reset({ title: "" });
    }
  }, [open, list, form]);

  async function onSubmit(values: RenameFormValues) {
    if (!list) return;
    if (values.title === list.title) {
      onOpenChange(false);
      return;
    }

    const { data, error } = await actions.lists.rename({ listId: list.id, title: values.title });

    if (error) {
      if (isInputError(error)) {
        const titleMessage = error.fields.title?.[0];
        if (titleMessage) {
          form.setError("title", { message: titleMessage });
        }
        return;
      }
      toast.error(error.message || "Could not rename list");
      return;
    }

    onRenamed(data);
    onOpenChange(false);
    toast.success("List renamed");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename list</DialogTitle>
          <DialogDescription>Give your list a new name.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoFocus autoComplete="off" maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                }}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
