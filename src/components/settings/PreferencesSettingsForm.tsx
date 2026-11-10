import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/components/hooks/useT";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { LOCALES } from "@/lib/i18n/config";
import type { ProfilePreferencesInput } from "@/types";

interface Props {
  form: UseFormReturn<ProfilePreferencesInput>;
  busy: boolean;
  blocked: boolean;
  needsSync: boolean;
  onSubmit: (values: ProfilePreferencesInput) => Promise<void>;
}

export default function PreferencesSettingsForm({ form, busy, blocked, needsSync, onSubmit }: Props) {
  const { t } = useT();
  const hasChanges = form.formState.isDirty || needsSync;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("settingsForm.preferencesHeading")}</h2>
        </CardTitle>
        <CardDescription>{t("settingsForm.preferencesDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <fieldset disabled={busy} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="defaultCurrency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settingsForm.currency")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={busy}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SUPPORTED_CURRENCIES.map((currency) => (
                            <SelectItem key={currency} value={currency}>
                              {currency}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>{t("settingsForm.description")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("language.label")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={busy}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LOCALES.map((language) => (
                            <SelectItem key={language} value={language} lang={language}>
                              {t(`language.${language}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>{t("settingsForm.languageDescription")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {blocked && (
                <p id="settings-preferences-blocked" role="status" className="text-muted-foreground text-sm">
                  {t("settingsForm.otherEdits")}
                </p>
              )}
              {needsSync && <p className="text-muted-foreground text-sm">{t("settingsForm.languageSync")}</p>}
              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={busy || blocked || !hasChanges}
                  aria-describedby={blocked ? "settings-preferences-blocked" : undefined}
                >
                  {form.formState.isSubmitting ? t("settingsForm.saving") : t("settingsForm.savePreferences")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || !form.formState.isDirty}
                  onClick={() => {
                    form.reset();
                  }}
                >
                  {t("settingsForm.discard")}
                </Button>
              </div>
            </fieldset>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
