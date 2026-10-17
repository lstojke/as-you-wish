import { LogOut, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  email: string;
}

const SIGNOUT_FORM_ID = "profile-menu-signout";

export default function ProfileMenu({ email }: Props) {
  const initial = email.trim().charAt(0).toUpperCase() || "?";

  return (
    <>
      <form id={SIGNOUT_FORM_ID} method="POST" action="/api/auth/signout" className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Open profile menu"
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
              Settings
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <button type="submit" form={SIGNOUT_FORM_ID} className="w-full">
              <LogOut />
              Sign out
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
