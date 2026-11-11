import { useState } from "react";
import { actions } from "astro:actions";
import { Folder, ListPlus, Menu, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/components/hooks/useT";
import GroupNameDialog from "@/components/dashboard/GroupNameDialog";
import { groupHref, type PersonalListGroup, type ListGroupMembership } from "@/components/dashboard/group-types";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ListRow } from "@/lib/services/lists";

interface Props {
  groups: PersonalListGroup[];
  memberships: ListGroupMembership[];
  lists: ListRow[];
  ownedIds: Set<string>;
  loadError: boolean;
  onSaved: (group: PersonalListGroup) => void;
  onDeleted: (groupId: string) => void;
  onMembershipChanged: (groupId: string, listId: string, added: boolean) => void;
}

export default function PersonalListGroups({
  groups,
  memberships,
  lists,
  ownedIds,
  loadError,
  onSaved,
  onDeleted,
  onMembershipChanged,
}: Props) {
  const { t } = useT();
  const [nameOpen, setNameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<PersonalListGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PersonalListGroup | null>(null);
  const [manageTarget, setManageTarget] = useState<PersonalListGroup | null>(null);
  const [pending, setPending] = useState(false);

  async function deleteGroup(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!deleteTarget || pending) return;
    setPending(true);
    try {
      const { error } = await actions.listGroups.delete({ groupId: deleteTarget.id });
      if (error) {
        toast.error(error.message || t("listGroups.deleteError"));
        return;
      }
      onDeleted(deleteTarget.id);
      setDeleteTarget(null);
      toast.success(t("listGroups.deleted"));
    } catch {
      toast.error(t("listGroups.deleteError"));
    } finally {
      setPending(false);
    }
  }

  async function changeMembership(listId: string, added: boolean) {
    if (!manageTarget || pending) return;
    setPending(true);
    try {
      const input = { groupId: manageTarget.id, listId };
      const { error } = added ? await actions.listGroups.addList(input) : await actions.listGroups.removeList(input);
      if (error) {
        toast.error(error.message || t("listGroups.membershipError"));
        return;
      }
      onMembershipChanged(manageTarget.id, listId, added);
      toast.success(t(added ? "listGroups.listAdded" : "listGroups.listRemoved"));
    } catch {
      toast.error(t("listGroups.membershipError"));
    } finally {
      setPending(false);
    }
  }

  if (loadError) {
    return <GroupsLoadError />;
  }

  return (
    <>
      {groups.length > 0 && (
        <section aria-labelledby="personal-groups-heading" className="mb-8 space-y-4">
          <h2 id="personal-groups-heading" className="text-lg font-semibold">
            {t("listGroups.heading")}
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <li key={group.id} className="relative min-w-0 rounded-xl border p-3 pr-12">
                <a
                  href={groupHref(group.id)}
                  className="focus-visible:ring-ring flex min-w-0 items-start gap-2 rounded-sm font-semibold break-words hover:underline focus-visible:ring-2"
                >
                  <Folder className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">{group.name}</span>
                </a>
                <div className="absolute top-1 right-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("listGroups.actionsForGroup", { name: group.name })}
                      >
                        <Menu />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault();
                          setManageTarget(group);
                        }}
                      >
                        <ListPlus />
                        {t("listGroups.manage")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={(event) => {
                          event.preventDefault();
                          setRenameTarget(group);
                          setNameOpen(true);
                        }}
                      >
                        <Pencil />
                        {t("dashboardLists.rename")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={(event) => {
                          event.preventDefault();
                          setDeleteTarget(group);
                        }}
                      >
                        <Trash2 />
                        {t("dashboardLists.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <GroupNameDialog open={nameOpen} group={renameTarget} onOpenChange={setNameOpen} onSaved={onSaved} />
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("listGroups.deleteTitle", { name: deleteTarget?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("listGroups.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t("dashboardLists.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={deleteGroup}>
              {t(pending ? "dashboardLists.deleting" : "dashboardLists.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={manageTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setManageTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="break-words">
              {t("listGroups.manageTitle", { name: manageTarget?.name ?? "" })}
            </DialogTitle>
            <DialogDescription>{t("listGroups.manageDescription")}</DialogDescription>
          </DialogHeader>
          {lists.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("listGroups.noAccessibleLists")}</p>
          ) : (
            <ul className="max-h-[50vh] space-y-2 overflow-y-auto" aria-busy={pending}>
              {lists
                .filter((list) => list.owner_id !== "")
                .map((list) => {
                  const added = memberships.some(
                    (entry) => entry.group_id === manageTarget?.id && entry.list_id === list.id,
                  );
                  return (
                    <li key={list.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{list.title}</p>
                        <p className="text-muted-foreground text-xs">
                          {t(ownedIds.has(list.id) ? "dashboardLists.myLists" : "dashboardLists.sharedWithMe")}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={added ? "secondary" : "outline"}
                        disabled={pending}
                        aria-label={t(added ? "listGroups.removeNamedList" : "listGroups.addNamedList", {
                          title: list.title,
                        })}
                        onClick={() => changeMembership(list.id, !added)}
                      >
                        {t(added ? "listGroups.remove" : "listGroups.add")}
                      </Button>
                    </li>
                  );
                })}
            </ul>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => {
                setManageTarget(null);
              }}
            >
              {t("listGroups.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function GroupsLoadError() {
  const { t } = useT();
  return (
    <section role="alert" className="mb-6 space-y-3 rounded-xl border p-4">
      <p>{t("listGroups.loadError")}</p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          window.location.reload();
        }}
      >
        {t("dashboardLists.retry")}
      </Button>
    </section>
  );
}
