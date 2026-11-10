import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { actions, isInputError } from "astro:actions";
import type { z } from "zod";
import { toast } from "sonner";
import { I18nProvider } from "@/components/I18nProvider";
import { useT } from "@/components/hooks/useT";
import { useSettingsMutation } from "@/components/hooks/useSettingsMutation";
import ProfileDetailsForm from "@/components/settings/ProfileDetailsForm";
import PreferencesSettingsForm from "@/components/settings/PreferencesSettingsForm";
import ImportantDatesSection from "@/components/settings/ImportantDatesSection";
import { profileDetailsSchema, profilePreferencesSchema } from "@/lib/schemas/profile";
import { DEFAULT_REPEAT_FREQUENCY, importantDateCreateSchema } from "@/lib/schemas/important-dates";
import type { Locale } from "@/lib/i18n/config";
import type {
  ProfileDetailsInput,
  ProfilePreferencesInput,
  ProfileSettingsData,
  ImportantDate,
  ImportantDateFormValues,
  ImportantDateCreateInput,
} from "@/types";

interface Props {
  locale: Locale;
  email: string;
  profile: ProfileSettingsData;
  importantDates: ImportantDate[];
}

function ProfileSettingsInner({ email, profile, importantDates }: Omit<Props, "locale">) {
  const { locale, t } = useT();
  const mutation = useSettingsMutation();
  const [persistedLanguage, setPersistedLanguage] = useState(profile.language);
  const detailsForm = useForm<z.input<typeof profileDetailsSchema>, unknown, ProfileDetailsInput>({
    resolver: zodResolver(profileDetailsSchema),
    defaultValues: { firstName: profile.firstName ?? "", lastName: profile.lastName ?? "" },
  });
  const preferencesForm = useForm<ProfilePreferencesInput>({
    resolver: zodResolver(profilePreferencesSchema),
    defaultValues: { defaultCurrency: profile.defaultCurrency, language: locale },
  });
  const dateForm = useForm<ImportantDateFormValues, unknown, ImportantDateCreateInput>({
    resolver: zodResolver(importantDateCreateSchema),
    defaultValues: { date: "", heading: "", description: "", repeatFrequency: DEFAULT_REPEAT_FREQUENCY },
  });

  async function saveDetails(values: ProfileDetailsInput) {
    if (!mutation.start()) {
      toast.error(t("settingsForm.busy"));
      return;
    }
    try {
      const { data, error } = await actions.profile.updateDetails(values);
      if (error) {
        if (isInputError(error)) {
          for (const name of ["firstName", "lastName"] as const) {
            const message = error.fields[name]?.[0];
            if (message) detailsForm.setError(name, { message });
          }
          toast.error(t("errors.settingsUpdate"));
        } else {
          toast.error(error.message || t("errors.settingsUpdate"));
        }
        return;
      }
      detailsForm.reset({ firstName: data.firstName ?? "", lastName: data.lastName ?? "" });
      toast.success(t("settingsForm.profileSaved"));
    } catch {
      toast.error(t("errors.settingsUpdate"));
    } finally {
      mutation.finish();
    }
  }

  async function savePreferences(values: ProfilePreferencesInput) {
    if (detailsForm.formState.isDirty || dateForm.formState.isDirty) {
      toast.error(t("settingsForm.otherEdits"));
      return;
    }
    if (!mutation.start()) {
      toast.error(t("settingsForm.busy"));
      return;
    }
    let navigating = false;
    try {
      const { data, error } = await actions.profile.updatePreferences(values);
      if (error) {
        if (isInputError(error)) {
          for (const name of ["defaultCurrency", "language"] as const) {
            const message = error.fields[name]?.[0];
            if (message) preferencesForm.setError(name, { message });
          }
          toast.error(t("errors.settingsUpdate"));
        } else {
          toast.error(error.message || t("errors.settingsUpdate"));
        }
        return;
      }
      preferencesForm.reset(data);
      setPersistedLanguage(data.language);
      if (data.language !== locale) {
        window.location.assign("/settings");
        navigating = true;
      } else {
        toast.success(t("settingsForm.saved"));
      }
    } catch {
      toast.error(t("errors.settingsUpdate"));
    } finally {
      if (!navigating) mutation.finish();
    }
  }

  return (
    <div className="space-y-6">
      <ProfileDetailsForm email={email} form={detailsForm} busy={mutation.busy} onSubmit={saveDetails} />
      <PreferencesSettingsForm
        form={preferencesForm}
        busy={mutation.busy}
        blocked={detailsForm.formState.isDirty || dateForm.formState.isDirty}
        needsSync={persistedLanguage !== locale}
        onSubmit={savePreferences}
      />
      <ImportantDatesSection initialDates={importantDates} form={dateForm} mutation={mutation} />
    </div>
  );
}

export default function ProfileSettings({ locale, ...props }: Props) {
  return (
    <I18nProvider locale={locale}>
      <ProfileSettingsInner {...props} />
    </I18nProvider>
  );
}
