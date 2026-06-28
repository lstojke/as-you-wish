import { useState } from "react";
import type { ListRow } from "@/lib/services/lists";
import type { ItemRow } from "@/lib/services/items";
import ItemsList from "@/components/lists/ItemsList";
import AddItemForm from "@/components/lists/AddItemForm";

interface Props {
  list: ListRow;
  initialItems: ItemRow[];
}

export default function ListDetail({ list, initialItems }: Props) {
  const [items, setItems] = useState<ItemRow[]>(initialItems);

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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{list.title}</h1>
      </div>
      <ItemsList items={items} />
      <AddItemForm
        listId={list.id}
        onOptimisticAdd={handleOptimisticAdd}
        onOptimisticReplace={handleOptimisticReplace}
        onOptimisticRemove={handleOptimisticRemove}
      />
    </div>
  );
}
