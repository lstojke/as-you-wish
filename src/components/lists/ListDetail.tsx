import { useState } from "react";
import type { ListRow } from "@/lib/services/lists";
import type { ItemRow } from "@/lib/services/items";
import ItemsList from "@/components/lists/ItemsList";
import AddItemForm from "@/components/lists/AddItemForm";
import ListActionsMenu from "@/components/dashboard/ListActionsMenu";
import RenameListDialog from "@/components/dashboard/RenameListDialog";
import DeleteListDialog from "@/components/dashboard/DeleteListDialog";

interface Props {
  list: ListRow;
  initialItems: ItemRow[];
  currentUserId: string;
}

export default function ListDetail({ list: initialList, initialItems, currentUserId }: Props) {
  const [list, setList] = useState<ListRow>(initialList);
  const [items, setItems] = useState<ItemRow[]>(initialItems);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const isOwner = list.owner_id === currentUserId;

  function handleOptimisticAdd(placeholder: ItemRow) {
    setItems((prev) => [...prev, placeholder]);
  }

  function handleOptimisticReplace(placeholderId: string, real: ItemRow) {
    setItems((prev) => prev.map((i) => (i.id === placeholderId ? real : i)));
  }

  function handleOptimisticRemove(placeholderId: string) {
    setItems((prev) => prev.filter((i) => i.id !== placeholderId));
  }

  return (
    <div className="space-y-8">
      <div>
        <a
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
        >
          ← Back to lists
        </a>
        <div className="mt-2 flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{list.title}</h1>
          {isOwner && (
            <ListActionsMenu
              listTitle={list.title}
              onRename={() => {
                setRenameOpen(true);
              }}
              onDelete={() => {
                setDeleteOpen(true);
              }}
            />
          )}
        </div>
      </div>
      <ItemsList items={items} />
      <AddItemForm
        listId={list.id}
        onOptimisticAdd={handleOptimisticAdd}
        onOptimisticReplace={handleOptimisticReplace}
        onOptimisticRemove={handleOptimisticRemove}
      />

      {isOwner && (
        <>
          <RenameListDialog
            list={list}
            open={renameOpen}
            onOpenChange={setRenameOpen}
            onRenamed={(updated) => {
              setList(updated);
            }}
          />
          <DeleteListDialog
            list={list}
            itemCount={items.length}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onDeleted={() => {
              window.location.assign("/dashboard");
            }}
          />
        </>
      )}
    </div>
  );
}
