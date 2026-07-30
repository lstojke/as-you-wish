import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { actions, isInputError } from "astro:actions";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import ItemFormFields from "@/components/lists/ItemFormFields";
import { itemFormSchema, mapItemFormToCreate, type ItemFormValues } from "@/lib/schemas/wishlist";
import type { ItemRow } from "@/lib/services/items";

interface Props {
  listId: string;
  onOptimisticAdd: (placeholder: ItemRow) => void;
  onOptimisticReplace: (placeholderId: string, real: ItemRow) => void;
  onOptimisticRemove: (placeholderId: string) => void;
}

export default function AddItemForm({ listId, onOptimisticAdd, onOptimisticReplace, onOptimisticRemove }: Props) {
  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormSchema),
    defaultValues: { title: "", priceInput: "", link: "" },
  });

  async function onSubmit(values: ItemFormValues) {
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
      currency: input.priceCents !== undefined ? "USD" : null,
      created_at: now,
      updated_at: now,
    };
    onOptimisticAdd(placeholder);

    const { data, error } = await actions.items.create(input);

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
    form.reset();
    toast.success("Item added");
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">Add an item</h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <ItemFormFields control={form.control} />
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Adding…" : "Add item"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
