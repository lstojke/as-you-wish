import { useState } from "react";
import { actions } from "astro:actions";
import { toast } from "sonner";
import type { ListRow } from "@/lib/services/lists";
import type { ItemRow } from "@/lib/services/items";
import type { InvitationRow } from "@/lib/services/invitations";
import ItemsList from "@/components/lists/ItemsList";
import AddItemForm from "@/components/lists/AddItemForm";
import EditItemForm from "@/components/lists/EditItemForm";
import DeleteItemDialog from "@/components/lists/DeleteItemDialog";
import InviteDialog from "@/components/lists/InviteDialog";
import ShareLinkDialog from "@/components/lists/ShareLinkDialog";
import PendingInvitations from "@/components/lists/PendingInvitations";
import ListActionsMenu from "@/components/dashboard/ListActionsMenu";
import RenameListDialog from "@/components/dashboard/RenameListDialog";
import DeleteListDialog from "@/components/dashboard/DeleteListDialog";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/lib/i18n/config";
import { I18nProvider } from "@/components/I18nProvider";
import { useT } from "@/components/hooks/useT";

interface Props {
  list: ListRow;
  initialItems: ItemRow[];
  reservedItemIds: string[];
  myReservedItemIds: string[];
  initialInvitations: InvitationRow[];
  currentUserId: string;
  defaultCurrency: string;
  locale: Locale;
}

function ListDetailInner({
  list: initialList,
  initialItems,
  reservedItemIds,
  myReservedItemIds,
  initialInvitations,
  currentUserId,
  defaultCurrency,
}: Omit<Props, "locale">) {
  const { t } = useT();
  const [list, setList] = useState<ListRow>(initialList);
  const [items, setItems] = useState<ItemRow[]>(initialItems);
  const [invitations, setInvitations] = useState<InvitationRow[]>(initialInvitations);
  const [reserved, setReserved] = useState<string[]>(reservedItemIds);
  const [myReserved, setMyReserved] = useState<string[]>(myReservedItemIds);
  const [pendingItemIds, setPendingItemIds] = useState<string[]>([]);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ItemRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ItemRow | null>(null);

  const isOwner = list.owner_id === currentUserId;

  async function handleReserve(item: ItemRow) {
    setPendingItemIds((prev) => [...prev, item.id]);
    const { error } = await actions.reservations.reserve({ itemId: item.id });
    setPendingItemIds((prev) => prev.filter((id) => id !== item.id));
    if (error) {
      // Lost the race: the item is now taken by someone else - reflect that truthfully.
      if (error.code === "CONFLICT") {
        setReserved((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
        toast.error(t("listDetail.reserveConflict"));
        return;
      }
      toast.error(error.message || t("errors.reserveFailed"));
      return;
    }
    setReserved((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
    setMyReserved((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
    toast.success(t("listDetail.reserved"));
  }

  async function handleRelease(item: ItemRow) {
    setPendingItemIds((prev) => [...prev, item.id]);
    const { error } = await actions.reservations.release({ itemId: item.id });
    setPendingItemIds((prev) => prev.filter((id) => id !== item.id));
    if (error) {
      toast.error(error.message || t("errors.releaseFailed"));
      return;
    }
    setReserved((prev) => prev.filter((id) => id !== item.id));
    setMyReserved((prev) => prev.filter((id) => id !== item.id));
    toast.success(t("listDetail.released"));
  }

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
          {t("common.backToLists")}
        </a>
        <div className="mt-2 flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{list.title}</h1>
          {isOwner && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShareOpen(true);
                }}
              >
                {t("listDetail.shareLink")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setInviteOpen(true);
                }}
              >
                {t("listDetail.invite")}
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
        reservedItemIds={reserved}
        myReservedItemIds={myReserved}
        pendingItemIds={pendingItemIds}
        canClaim={!isOwner}
        ownedByCurrentUser={isOwner}
        onEdit={(item) => {
          setEditTarget(item);
        }}
        onDelete={(item) => {
          setDeleteTarget(item);
        }}
        onReserve={handleReserve}
        onRelease={handleRelease}
      />

      {isOwner && (
        <>
          <AddItemForm
            listId={list.id}
            defaultCurrency={defaultCurrency}
            onOptimisticAdd={handleOptimisticAdd}
            onOptimisticReplace={handleOptimisticReplace}
            onOptimisticRemove={handleOptimisticRemove}
          />
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
          {shareOpen && <ShareLinkDialog listId={list.id} open={shareOpen} onOpenChange={setShareOpen} />}
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
            defaultCurrency={defaultCurrency}
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

export default function ListDetail({ locale, ...props }: Props) {
  return (
    <I18nProvider locale={locale}>
      <ListDetailInner {...props} />
    </I18nProvider>
  );
}
