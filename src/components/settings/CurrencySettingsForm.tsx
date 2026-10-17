import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { actions } from "astro:actions";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_CURRENCIES, profileUpdateSchema, type ProfileUpdateInput } from "@/lib/currency";
import { I18nProvider } from "@/components/I18nProvider";
import { useT } from "@/components/hooks/useT";
import type { Locale } from "@/lib/i18n/config";

interface Props {
  locale: Locale;
  defaultCurrency: string;
}

function CurrencySettingsFormInner({ defaultCurrency }: Omit<Props, "locale">) {
  const { t } = useT();
  const form = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: { defaultCurrency: defaultCurrency as ProfileUpdateInput["defaultCurrency"] },
  });

  async function onSubmit(values: ProfileUpdateInput) {
    const { data, error } = await actions.profile.updateCurrency(values);
    if (error) {
      toast.error(error.message || t("errors.settingsUpdate"));
      return;
    }
    form.reset({ defaultCurrency: data.default_currency as ProfileUpdateInput["defaultCurrency"] });
    toast.success(t("settingsForm.saved"));
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
              <FormLabel>{t("settingsForm.currency")}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder={t("settingsForm.selectCurrency")} />
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
              <FormDescription>{t("settingsForm.description")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? t("settingsForm.saving") : t("settingsForm.save")}
        </Button>
      </form>
    </Form>
  );
}

export default function CurrencySettingsForm({ locale, ...props }: Props) {
  return (
    <I18nProvider locale={locale}>
      <CurrencySettingsFormInner {...props} />
    </I18nProvider>
  );
}
