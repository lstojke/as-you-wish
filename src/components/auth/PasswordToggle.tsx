import { Eye, EyeOff } from "lucide-react";
import { useT } from "@/components/hooks/useT";

interface PasswordToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordToggle({ visible, onToggle }: PasswordToggleProps) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-input absolute top-1/2 right-3 -translate-y-1/2 rounded-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      aria-label={visible ? t("authForm.hidePassword") : t("authForm.showPassword")}
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );
}
