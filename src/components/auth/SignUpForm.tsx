import React, { useState } from "react";
import { Mail, Lock, UserPlus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { I18nProvider } from "@/components/I18nProvider";
import { useT } from "@/components/hooks/useT";
import type { Locale } from "@/lib/i18n/config";

const MIN_PASSWORD_LENGTH = 6;

interface Props {
  locale: Locale;
  serverError?: string | null;
}

function SignUpFormInner({ serverError }: Omit<Props, "locale">) {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});

  function validate() {
    const next: typeof errors = {};

    if (!email.trim()) {
      next.email = t("authForm.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = t("authForm.emailInvalid");
    }

    if (!password) {
      next.password = t("authForm.passwordRequired");
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = t("authForm.passwordMin", { count: MIN_PASSWORD_LENGTH });
    }

    if (!confirmPassword) {
      next.confirmPassword = t("authForm.passwordConfirmRequired");
    } else if (password !== confirmPassword) {
      next.confirmPassword = t("authForm.passwordMismatch");
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  const passwordHint =
    !errors.password && password.length > 0 && password.length < MIN_PASSWORD_LENGTH ? (
      <p className="text-muted-foreground mt-1 text-xs">
        {t("authForm.remainingCharacters", { count: MIN_PASSWORD_LENGTH - password.length })}
      </p>
    ) : undefined;

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label={t("authForm.email")}
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder={t("authForm.emailPlaceholder")}
        error={errors.email}
        icon={<Mail className="size-4" />}
      />

      <FormField
        id="password"
        label={t("authForm.password")}
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={t("authForm.passwordMinPlaceholder")}
        error={errors.password}
        hint={passwordHint}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label={t("authForm.confirmPassword")}
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder={t("authForm.confirmPasswordPlaceholder")}
        error={errors.confirmPassword}
        icon={<Lock className="size-4" />}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText={t("authForm.signUpPending")} icon={<UserPlus className="size-4" />}>
        {t("authForm.signUp")}
      </SubmitButton>
    </form>
  );
}

export default function SignUpForm({ locale, ...props }: Props) {
  return (
    <I18nProvider locale={locale}>
      <SignUpFormInner {...props} />
    </I18nProvider>
  );
}
