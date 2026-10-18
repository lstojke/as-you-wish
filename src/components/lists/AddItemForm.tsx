import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { actions, isInputError } from "astro:actions";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ItemFormFields from "@/components/lists/ItemFormFields";
import { itemFormSchema, mapItemFormToCreate, type ItemFormValues } from "@/lib/schemas/wishlist";
import type { ItemRow } from "@/lib/services/items";

interface Props {
  listId: string;
  defaultCurrency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: () => void;
  onOptimisticAdd: (placeholder: ItemRow) => void;
  onOptimisticReplace: (placeholderId: string, real: ItemRow) => void;
  onOptimisticRemove: (placeholderId: string) => void;
}

export default function AddItemForm({
  listId,
  defaultCurrency,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onOptimisticAdd,
  onOptimisticReplace,
  onOptimisticRemove,
}: Props) {
  const busy = useRef(false);
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { title: "", priceInput: "", link: "", currency: defaultCurrency },
  });
  const { isSubmitting } = form.formState;

  useEffect(() => {
    form.reset({ title: "", priceInput: "", link: "", currency: defaultCurrency });
  }, [open, defaultCurrency, form]);

  function handleOpenChange(next: boolean) {
    if (!busy.current && !isSubmitting) onOpenChange(next);
  }

  async function onSubmit(values: ItemFormValues) {
    if (busy.current) return;
    busy.current = true;
    const input = mapItemFormToCreate(listId, values);

    const now = new Date().toISOString();
    const placeholderId = crypto.randomUUID();
    const placeholder: ItemRow = {
      id: placeholderId,
      list_id: listId,
      title: input.title,
      notes: null,
      link: input.link ?? null,
      price_cents: input.priceCents ?? null,
      currency: input.currency ?? null,
      created_at: now,
      updated_at: now,
    };
    onOptimisticAdd(placeholder);

    let result: Awaited<ReturnType<typeof actions.items.create>>;
    try {
      result = await actions.items.create(input);
    } catch {
      onOptimisticRemove(placeholderId);
      toast.error("Could not confirm whether the item was added. Refresh the list before trying again.");
      return;
    } finally {
      busy.current = false;
    }

    const { data, error } = result;
    if (error) {
      onOptimisticRemove(placeholderId);
      if (isInputError(error)) {
        const titleMsg = error.fields.title?.[0];
        if (titleMsg) form.setError("title", { message: titleMsg });
        const linkMsg = error.fields.link?.[0];
        if (linkMsg) form.setError("link", { message: linkMsg });
        return;
      }
      toast.error(error.message || "Could not add item");
      return;
    }

    onOptimisticReplace(placeholderId, data);
    onOpenChange(false);
    toast.success("Item added");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onCloseAutoFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Add an item</DialogTitle>
          <DialogDescription>Add a name and optional price or store link to your list.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={(event) => {
              if (busy.current || isSubmitting) {
                event.preventDefault();
                return;
              }
              void form.handleSubmit(onSubmit)(event);
            }}
            className="space-y-4"
          >
            <ItemFormFields control={form.control} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => {
                  handleOpenChange(false);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Adding…" : "Add item"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
