import { useState } from "react";
import type { ListRow } from "@/lib/services/lists";
import type { ItemRow } from "@/lib/services/items";
import type { InvitationRow } from "@/lib/services/invitations";
import ItemsList from "@/components/lists/ItemsList";
import AddItemForm from "@/components/lists/AddItemForm";
import EditItemForm from "@/components/lists/EditItemForm";
import DeleteItemDialog from "@/components/lists/DeleteItemDialog";
import InviteDialog from "@/components/lists/InviteDialog";
import PendingInvitations from "@/components/lists/PendingInvitations";
import ListActionsMenu from "@/components/dashboard/ListActionsMenu";
import RenameListDialog from "@/components/dashboard/RenameListDialog";
import DeleteListDialog from "@/components/dashboard/DeleteListDialog";
import { Button } from "@/components/ui/button";

interface Props {
  list: ListRow;
  initialItems: ItemRow[];
  initialInvitations: InvitationRow[];
  currentUserId: string;
}

export default function ListDetail({ list: initialList, initialItems, initialInvitations, currentUserId }: Props) {
  const [list, setList] = useState<ListRow>(initialList);
  const [items, setItems] = useState<ItemRow[]>(initialItems);
  const [invitations, setInvitations] = useState<InvitationRow[]>(initialInvitations);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ItemRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ItemRow | null>(null);

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

  function handleItemUpdated(updated: ItemRow) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
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
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setInviteOpen(true);
                }}
              >
                Invite
              </Button>
              <ListActionsMenu
                listTitle={list.title}
                onRename={() => {
                  setRenameOpen(true);
                }}
                onDelete={() => {
                  setDeleteOpen(true);
                }}
              />
            </div>
          )}
        </div>
      </div>
      <ItemsList
        items={items}
        ownedByCurrentUser={isOwner}
        onEdit={(item) => {
          setEditTarget(item);
        }}
        onDelete={(item) => {
          setDeleteTarget(item);
        }}
      />
      <AddItemForm
        listId={list.id}
        onOptimisticAdd={handleOptimisticAdd}
        onOptimisticReplace={handleOptimisticReplace}
        onOptimisticRemove={handleOptimisticRemove}
      />

      {isOwner && (
        <>
          <PendingInvitations
            invitations={invitations}
            onRevoked={(id) => {
              setInvitations((prev) => prev.filter((inv) => inv.id !== id));
            }}
          />
          <InviteDialog
            listId={list.id}
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            onInvited={(invitation) => {
              setInvitations((prev) => [invitation, ...prev]);
            }}
          />
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
          <EditItemForm
            item={editTarget}
            open={editTarget !== null}
            onOpenChange={(open) => {
              if (!open) setEditTarget(null);
            }}
            onUpdated={handleItemUpdated}
          />
          <DeleteItemDialog
            item={deleteTarget}
            open={deleteTarget !== null}
            onOpenChange={(open) => {
              if (!open) setDeleteTarget(null);
            }}
            onOptimisticDelete={() => {
              if (!deleteTarget) return undefined;
              const removed = deleteTarget;
              let originalIndex = -1;
              setItems((prev) => {
                originalIndex = prev.findIndex((i) => i.id === removed.id);
                return prev.filter((i) => i.id !== removed.id);
              });
              return () => {
                setItems((prev) => {
                  if (originalIndex < 0) return [...prev, removed];
                  const next = prev.slice();
                  next.splice(originalIndex, 0, removed);
                  return next;
                });
              };
            }}
            onDeleted={() => {
              // Optimistic remove already done; nothing to do on success.
            }}
          />
        </>
      )}
    </div>
  );
}
