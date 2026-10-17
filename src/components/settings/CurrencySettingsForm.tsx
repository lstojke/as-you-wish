import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { actions } from "astro:actions";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_CURRENCIES, profileUpdateSchema, type ProfileUpdateInput } from "@/lib/currency";

interface Props {
  defaultCurrency: string;
}

export default function CurrencySettingsForm({ defaultCurrency }: Props) {
  const form = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: { defaultCurrency: defaultCurrency as ProfileUpdateInput["defaultCurrency"] },
  });

  async function onSubmit(values: ProfileUpdateInput) {
    const { data, error } = await actions.profile.updateCurrency(values);
    if (error) {
      toast.error(error.message || "Could not update settings");
      return;
    }
    form.reset({ defaultCurrency: data.default_currency as ProfileUpdateInput["defaultCurrency"] });
    toast.success("Settings saved");
  }

  const { isSubmitting, isDirty } = form.formState;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="defaultCurrency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default currency</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Select a currency" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Applied to new priced items. Existing items keep their currency.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
      </form>
    </Form>
  );
}
