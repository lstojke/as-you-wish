import { useState } from "react";
import { ArrowLeft, Plus, ListPlus } from "lucide-react";
import CreateListDialog from "@/components/dashboard/CreateListDialog";
import DeleteListDialog from "@/components/dashboard/DeleteListDialog";
import ListActionsMenu from "@/components/dashboard/ListActionsMenu";
import RenameListDialog from "@/components/dashboard/RenameListDialog";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ListRow } from "@/lib/services/lists";
import { I18nProvider } from "@/components/I18nProvider";
import { useT } from "@/components/hooks/useT";
import type { Locale } from "@/lib/i18n/config";
import PersonalListGroups, { GroupsLoadError } from "@/components/dashboard/PersonalListGroups";
import { groupHref, type PersonalListGroup, type ListGroupMembership } from "@/components/dashboard/group-types";
import { Badge } from "@/components/ui/badge";
import GroupNameDialog from "@/components/dashboard/GroupNameDialog";

interface Props {
  locale: Locale;
  owned: ListRow[];
  shared: ListRow[];
  loadError: boolean;
  groups: PersonalListGroup[];
  memberships: ListGroupMembership[];
  groupsLoadError: boolean;
  selectedGroupId: string | null;
}

function DashboardListsInner({
  owned: initialOwned,
  shared,
  loadError,
  groups: initialGroups,
  memberships: initialMemberships,
  groupsLoadError,
  selectedGroupId: initialGroupId,
}: Omit<Props, "locale">) {
  const { t } = useT();
  const [owned, setOwned] = useState<ListRow[]>(initialOwned);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ListRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ListRow | null>(null);
  const [groups, setGroups] = useState(initialGroups);
  const [memberships, setMemberships] = useState(initialMemberships);
  const selectedGroupId = initialGroupId;
  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const allLists = [...owned, ...shared];
  const ownedIds = new Set(owned.map((list) => list.id));
  const groupLists = allLists.filter((list) =>
    memberships.some((membership) => membership.group_id === selectedGroupId && membership.list_id === list.id),
  );

  function labelsFor(listId: string) {
    return groups.filter((group) =>
      memberships.some((entry) => entry.group_id === group.id && entry.list_id === listId),
    );
  }

  function handleOptimisticAdd(placeholder: ListRow) {
    setOwned((prev) => [placeholder, ...prev]);
  }

  function handleOptimisticReplace(placeholderId: string, real: ListRow) {
    setOwned((prev) => prev.map((l) => (l.id === placeholderId ? real : l)));
  }

  function handleOptimisticRemove(placeholderId: string) {
    setOwned((prev) => prev.filter((l) => l.id !== placeholderId));
  }

  function handleRenamed(updated: ListRow) {
    setOwned((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  }

  const hasOwned = owned.length > 0;
  const hasShared = shared.length > 0;

  if (loadError) {
    return (
      <section
        aria-labelledby="lists-load-error-heading"
        role="alert"
        className="border-destructive/40 bg-destructive/10 flex flex-col items-start gap-3 rounded-xl border p-6"
      >
        <div>
          <h2 id="lists-load-error-heading" className="font-semibold">
            {t("dashboardLists.loadErrorTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">{t("dashboardLists.loadErrorBody")}</p>
        </div>
        <Button
          onClick={() => {
            window.location.reload();
          }}
          size="sm"
        >
          {t("dashboardLists.retry")}
        </Button>
      </section>
    );
  }

  return (
    <div>
      {selectedGroupId === null && (
        <PersonalListGroups
          groups={groups}
          memberships={memberships}
          lists={allLists.filter((list) => list.owner_id !== "")}
          ownedIds={ownedIds}
          loadError={groupsLoadError}
          onSaved={(group) => {
            setGroups((previous) =>
              previous.some((entry) => entry.id === group.id)
                ? previous.map((entry) => (entry.id === group.id ? group : entry))
                : [...previous, group],
            );
          }}
          onDeleted={(groupId) => {
            setGroups((previous) => previous.filter((group) => group.id !== groupId));
            setMemberships((previous) => previous.filter((entry) => entry.group_id !== groupId));
          }}
          onMembershipChanged={(groupId, listId, added) => {
            setMemberships((previous) => {
              const rest = previous.filter((entry) => entry.group_id !== groupId || entry.list_id !== listId);
              return added ? [...rest, { group_id: groupId, list_id: listId }] : rest;
            });
          }}
        />
      )}
      {selectedGroupId !== null && (
        <section aria-labelledby={groupsLoadError ? undefined : "selected-group-heading"} className="space-y-4">
          <div className="flex justify-end">
            <Button asChild size="sm" variant="outline">
              <a href="/dashboard">
                <ArrowLeft aria-hidden="true" />
                {t("listGroups.back")}
              </a>
            </Button>
          </div>
          {groupsLoadError ? (
            <GroupsLoadError />
          ) : (
            <>
              <h2 id="selected-group-heading" className="text-xl font-semibold break-words">
                {selectedGroup?.name ?? t("listGroups.unavailable")}
              </h2>
              {selectedGroup &&
                (groupLists.length === 0 ? (
                  <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                    {t("listGroups.groupEmpty")}
                  </p>
                ) : (
                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
                    {groupLists.map((list) =>
                      ownedIds.has(list.id) ? (
                        <OwnedListCard
                          key={list.id}
                          list={list}
                          groups={labelsFor(list.id)}
                          onRename={() => {
                            setRenameTarget(list);
                          }}
                          onDelete={() => {
                            setDeleteTarget(list);
                          }}
                        />
                      ) : (
                        <SharedListCard key={list.id} list={list} groups={labelsFor(list.id)} />
                      ),
                    )}
                  </div>
                ))}
            </>
          )}
        </section>
      )}
      {selectedGroupId === null && (
        <>
          <div className="mb-4 flex flex-wrap justify-end gap-2">
            {!groupsLoadError && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setGroupDialogOpen(true);
                }}
              >
                <Plus aria-hidden="true" />
                {t("listGroups.create")}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setDialogOpen(true);
              }}
            >
              <Plus aria-hidden="true" />
              {t("dashboardLists.createList")}
            </Button>
          </div>
          <Tabs defaultValue="my-lists" className="w-full">
            <TabsList aria-label={t("dashboardLists.tabsLabel")} className="grid h-11 w-full grid-cols-2">
              <TabsTrigger value="my-lists">{t("dashboardLists.myLists")}</TabsTrigger>
              <TabsTrigger value="shared-lists">{t("dashboardLists.sharedWithMe")}</TabsTrigger>
            </TabsList>

            <TabsContent value="my-lists" className="mt-6">
              {hasOwned ? (
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
                  {owned.map((list) => (
                    <OwnedListCard
                      key={list.id}
                      list={list}
                      groups={labelsFor(list.id)}
                      onRename={() => {
                        setRenameTarget(list);
                      }}
                      onDelete={() => {
                        setDeleteTarget(list);
                      }}
                    />
                  ))}
                </div>
              ) : (
                <EmptyHero />
              )}
            </TabsContent>

            <TabsContent value="shared-lists" className="mt-6">
              <section aria-labelledby="shared-heading">
                <h2 id="shared-heading" className="sr-only">
                  {t("dashboardLists.sharedWithMe")}
                </h2>
                {hasShared ? (
                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
                    {shared.map((list) => (
                      <SharedListCard key={list.id} list={list} groups={labelsFor(list.id)} />
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground rounded-xl border p-6 text-center text-sm">
                    {t("dashboardLists.sharedEmpty")}
                  </p>
                )}
              </section>
            </TabsContent>
          </Tabs>
        </>
      )}

      <GroupNameDialog
        open={groupDialogOpen}
        group={null}
        onOpenChange={setGroupDialogOpen}
        onSaved={(group) => {
          setGroups((previous) => [...previous, group]);
        }}
      />
      <CreateListDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onOptimisticAdd={handleOptimisticAdd}
        onOptimisticReplace={handleOptimisticReplace}
        onOptimisticRemove={handleOptimisticRemove}
      />

      <RenameListDialog
        list={renameTarget}
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
        onRenamed={handleRenamed}
      />

      <DeleteListDialog
        list={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onOptimisticDelete={() => {
          if (!deleteTarget) return undefined;
          const removed = deleteTarget;
          let originalIndex = -1;
          setOwned((prev) => {
            originalIndex = prev.findIndex((l) => l.id === removed.id);
            return prev.filter((l) => l.id !== removed.id);
          });
          return () => {
            setOwned((prev) => {
              if (originalIndex < 0) return [removed, ...prev];
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
    </div>
  );
}

export default function DashboardLists({ locale, ...props }: Props) {
  return (
    <I18nProvider locale={locale}>
      <DashboardListsInner {...props} />
    </I18nProvider>
  );
}

function OwnedListCard({
  list,
  groups,
  onRename,
  onDelete,
}: {
  list: ListRow;
  groups: PersonalListGroup[];
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  return (
    <Card className="hover:border-foreground/20 relative min-w-0 gap-0 py-0 transition-colors">
      <a
        href={`/lists/${list.id}`}
        className="focus-visible:ring-ring/50 block min-w-0 rounded-xl p-2 pr-12 outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-[3px] sm:p-4 sm:pr-14"
        aria-label={t("dashboardLists.openList", { title: list.title })}
      >
        <CardTitle className="text-sm leading-snug break-words whitespace-normal sm:text-base">{list.title}</CardTitle>
      </a>
      <div className="absolute top-1 right-1 sm:top-2 sm:right-2">
        <ListActionsMenu listTitle={list.title} onRename={onRename} onDelete={onDelete} />
      </div>
      <GroupLabels groups={groups} />
    </Card>
  );
}

function SharedListCard({ list, groups }: { list: ListRow; groups: PersonalListGroup[] }) {
  const { t } = useT();
  return (
    <Card className="hover:border-foreground/20 min-w-0 gap-0 py-0 transition-colors">
      <a
        href={`/lists/${list.id}`}
        className="focus-visible:ring-ring/50 block min-w-0 rounded-xl p-2 outline-none focus-visible:ring-[3px] sm:p-4"
        aria-label={t("dashboardLists.openList", { title: list.title })}
      >
        <CardTitle className="text-sm leading-snug break-words whitespace-normal sm:text-base">{list.title}</CardTitle>
      </a>
      <GroupLabels groups={groups} />
    </Card>
  );
}

function GroupLabels({ groups }: { groups: PersonalListGroup[] }) {
  const { t } = useT();
  if (groups.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1 px-2 pb-2 sm:px-4 sm:pb-4" aria-label={t("listGroups.heading")}>
      {groups.map((group) => (
        <li key={group.id} className="max-w-full min-w-0">
          <Badge asChild variant="secondary" className="h-auto max-w-full whitespace-normal">
            <a href={groupHref(group.id)} className="break-words">
              {group.name}
            </a>
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function EmptyHero() {
  const { t } = useT();
  return (
    <div className="border-muted-foreground/20 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center sm:p-12">
      <ListPlus className="text-muted-foreground size-10" aria-hidden="true" />
      <h3 className="text-lg font-semibold">{t("dashboardLists.emptyTitle")}</h3>
      <p className="text-muted-foreground max-w-sm text-sm">{t("dashboardLists.emptyBody")}</p>
    </div>
  );
}
