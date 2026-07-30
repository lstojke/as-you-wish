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
import { Form } from "@/components/ui/form";
import ItemFormFields from "@/components/lists/ItemFormFields";
import { itemFormSchema, mapItemFormToUpdate, type ItemFormValues } from "@/lib/schemas/wishlist";
import type { ItemRow } from "@/lib/services/items";

interface Props {
  item: ItemRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (updated: ItemRow) => void;
}

function itemRowToFormValues(item: ItemRow | null): ItemFormValues {
  return {
    title: item?.title ?? "",
    priceInput: item?.price_cents != null ? (item.price_cents / 100).toFixed(2) : "",
    link: item?.link ?? "",
  };
}

export default function EditItemForm({ item, open, onOpenChange, onUpdated }: Props) {
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: itemRowToFormValues(item),
  });

  useEffect(() => {
    if (open && item) {
      form.reset(itemRowToFormValues(item));
    }
  }, [open, item, form]);

  async function onSubmit(values: ItemFormValues) {
    if (!item) return;

    // Nothing changed — close without hitting the server.
    if (JSON.stringify(values) === JSON.stringify(itemRowToFormValues(item))) {
      onOpenChange(false);
      return;
    }

    const { data, error } = await actions.items.update(mapItemFormToUpdate(item.id, values));

    if (error) {
      if (isInputError(error)) {
        const titleMsg = error.fields.title?.[0];
        if (titleMsg) form.setError("title", { message: titleMsg });
        const linkMsg = error.fields.link?.[0];
        if (linkMsg) form.setError("link", { message: linkMsg });
        return;
      }
      toast.error(error.message || "Could not update item");
      return;
    }

    onUpdated(data);
    onOpenChange(false);
    toast.success("Item updated");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
          <DialogDescription>Update the details for this item.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <ItemFormFields control={form.control} />
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
