import { Check, LogOut, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  email: string;
  locale: Locale;
  returnTo: string;
}

const SIGNOUT_FORM_ID = "profile-menu-signout";
const LOCALE_FORM_ID = "profile-menu-locale";

export default function ProfileMenu({ email, locale, returnTo }: Props) {
  const initial = email.trim().charAt(0).toUpperCase() || "?";

  return (
    <>
      <form id={SIGNOUT_FORM_ID} method="POST" action="/api/auth/signout" className="hidden" />
      <form id={LOCALE_FORM_ID} method="POST" action="/api/locale" className="hidden">
        <input type="hidden" name="return" value={returnTo} />
      </form>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t(locale, "profileMenu.open")}
            className="bg-primary text-primary-foreground focus-visible:ring-ring/50 flex size-8 cursor-pointer items-center justify-center rounded-full text-sm font-semibold transition-opacity outline-none hover:opacity-90 focus-visible:ring-[3px]"
          >
            {initial}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuLabel className="text-muted-foreground truncate font-normal">{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/settings">
              <Settings />
              {t(locale, "profileMenu.settings")}
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
            {t(locale, "language.label")}
          </DropdownMenuLabel>
          {LOCALES.map((code) => (
            <DropdownMenuItem key={code} asChild>
              <button
                type="submit"
                form={LOCALE_FORM_ID}
                name="locale"
                value={code}
                lang={code}
                aria-current={code === locale ? "true" : undefined}
                className="w-full"
              >
                <Check className={cn(code !== locale && "invisible")} />
                {t(code, `language.${code}`)}
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <button type="submit" form={SIGNOUT_FORM_ID} className="w-full">
              <LogOut />
              {t(locale, "profileMenu.signOut")}
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
