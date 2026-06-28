import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { actions, isInputError } from "astro:actions";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { ItemRow } from "@/lib/services/items";

const addItemFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500, "Title must be 500 characters or fewer"),
  priceInput: z
    .string()
    .refine(
      (v) => v === "" || (!Number.isNaN(parseFloat(v)) && parseFloat(v) >= 0),
      "Enter a valid amount (e.g. 49.99)",
    ),
  link: z
    .string()
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "Must be an http(s) URL")
    .refine((v) => v === "" || v.length <= 2000, "URL is too long"),
});

type AddItemFormValues = z.infer<typeof addItemFormSchema>;

interface Props {
  listId: string;
  onOptimisticAdd: (placeholder: ItemRow) => void;
  onOptimisticReplace: (placeholderId: string, real: ItemRow) => void;
  onOptimisticRemove: (placeholderId: string) => void;
}

export default function AddItemForm({ listId, onOptimisticAdd, onOptimisticReplace, onOptimisticRemove }: Props) {
  const form = useForm<AddItemFormValues>({
    resolver: zodResolver(addItemFormSchema),
    defaultValues: { title: "", priceInput: "", link: "" },
  });

  async function onSubmit(values: AddItemFormValues) {
    const priceCents = values.priceInput ? Math.round(parseFloat(values.priceInput) * 100) : undefined;
    const link = values.link || undefined;

    const now = new Date().toISOString();
    const placeholderId = crypto.randomUUID();
    const placeholder: ItemRow = {
      id: placeholderId,
      list_id: listId,
      title: values.title,
      notes: null,
      link: link ?? null,
      price_cents: priceCents ?? null,
      currency: priceCents !== undefined ? "USD" : null,
      created_at: now,
      updated_at: now,
    };
    onOptimisticAdd(placeholder);

    const { data, error } = await actions.items.create({ listId, title: values.title, priceCents, link });

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
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Name <span aria-hidden="true">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="e.g. Blue sneakers" autoComplete="off" maxLength={500} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="priceInput"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. 49.99" autoComplete="off" inputMode="decimal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="link"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store link (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://…" type="url" autoComplete="off" maxLength={2000} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Adding…" : "Add item"}
          </Button>
        </form>
      </Form>
    </div>
  );
}
