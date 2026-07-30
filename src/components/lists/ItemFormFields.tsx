import type { Control } from "react-hook-form";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { ItemFormValues } from "@/lib/schemas/wishlist";

interface Props {
  control: Control<ItemFormValues>;
}

export default function ItemFormFields({ control }: Props) {
  return (
    <>
      <FormField
        control={control}
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
          control={control}
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
          control={control}
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
    </>
  );
}
