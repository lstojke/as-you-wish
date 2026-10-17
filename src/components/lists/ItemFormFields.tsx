import type { Control } from "react-hook-form";

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import type { ItemFormValues } from "@/lib/schemas/wishlist";

interface Props {
  control: Control<ItemFormValues>;
}

function currencyOptions(current: string): string[] {
  // Keep a legacy stored currency selectable so editing doesn't silently change it.
  const supported: readonly string[] = SUPPORTED_CURRENCIES;
  return current && !supported.includes(current) ? [...supported, current] : [...supported];
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
        <div className="flex gap-2">
          <FormField
            control={control}
            name="priceInput"
            render={({ field }) => (
              <FormItem className="flex-1">
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
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-24" aria-label="Currency">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {currencyOptions(field.value).map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
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
