import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { actions, isInputError } from "astro:actions";
import { toast } from "sonner";

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
import { listCreateSchema, type ListCreateInput } from "@/lib/schemas/wishlist";
import type { ListRow } from "@/lib/services/lists";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOptimisticAdd: (placeholder: ListRow) => void;
  onOptimisticReplace: (placeholderId: string, real: ListRow) => void;
  onOptimisticRemove: (placeholderId: string) => void;
}

export default function CreateListDialog({
  open,
  onOpenChange,
  onOptimisticAdd,
  onOptimisticReplace,
  onOptimisticRemove,
}: Props) {
  const form = useForm<ListCreateInput>({
    resolver: zodResolver(listCreateSchema),
    defaultValues: { title: "" },
  });

  useEffect(() => {
    if (!open) {
      form.reset({ title: "" });
    }
  }, [open, form]);

  async function onSubmit(values: ListCreateInput) {
    const placeholderId = crypto.randomUUID();
    const now = new Date().toISOString();
    const placeholder: ListRow = {
      id: placeholderId,
      title: values.title,
      owner_id: "",
      created_at: now,
      updated_at: now,
    };
    onOptimisticAdd(placeholder);

    const { data, error } = await actions.lists.create(values);

    if (error) {
      onOptimisticRemove(placeholderId);
      if (isInputError(error)) {
        const titleMessage = error.fields.title?.[0];
        if (titleMessage) {
          form.setError("title", { message: titleMessage });
        }
        return;
      }
      toast.error(error.message || "Could not create list");
      return;
    }

    onOptimisticReplace(placeholderId, data);
    onOpenChange(false);
    toast.success("List created");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a wish list</DialogTitle>
          <DialogDescription>Give your list a name. You can add items right after.</DialogDescription>
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
                    <Input
                      placeholder="e.g. Birthday wish list"
                      autoFocus
                      autoComplete="off"
                      maxLength={200}
                      {...field}
                    />
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
                {form.formState.isSubmitting ? "Creating…" : "Create list"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
