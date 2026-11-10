import type { z } from "zod";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/hooks/useT";
import type { profileDetailsSchema } from "@/lib/schemas/profile";
import type { ProfileDetailsInput } from "@/types";

interface Props {
  email: string;
  form: UseFormReturn<z.input<typeof profileDetailsSchema>, unknown, ProfileDetailsInput>;
  busy: boolean;
  onSubmit: (values: ProfileDetailsInput) => Promise<void>;
}

export default function ProfileDetailsForm({ email, form, busy, onSubmit }: Props) {
  const { t } = useT();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("settingsForm.profileHeading")}</h2>
        </CardTitle>
        <CardDescription>{t("settingsForm.profileDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6 grid gap-2">
          <Label htmlFor="settings-email">{t("authForm.email")}</Label>
          <Input id="settings-email" type="email" value={email} readOnly autoComplete="email" />
          <p className="text-muted-foreground text-sm">{t("settingsForm.emailReadOnly")}</p>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <fieldset disabled={busy} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settingsForm.firstName")}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} autoComplete="given-name" maxLength={100} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("settingsForm.lastName")}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} autoComplete="family-name" maxLength={100} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={busy || !form.formState.isDirty}>
                  {form.formState.isSubmitting ? t("settingsForm.saving") : t("settingsForm.saveProfile")}
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
