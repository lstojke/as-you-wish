import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useT } from "@/components/hooks/useT";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  itemTitle: string;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ItemActionsMenu({ itemTitle, onEdit, onDelete }: Props) {
  const { t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("itemForm.actionsForItem", { title: itemTitle })}
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            onEdit();
          }}
        >
          <Pencil />
          {t("itemForm.edit")}
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onSelect={(e) => {
            e.preventDefault();
            onDelete();
          }}
        >
          <Trash2 />
          {t("itemForm.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
