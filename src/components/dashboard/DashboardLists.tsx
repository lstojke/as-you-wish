import { useState } from "react";
import { Plus, ListPlus } from "lucide-react";
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

interface Props {
  locale: Locale;
  owned: ListRow[];
  shared: ListRow[];
  loadError: boolean;
}

function DashboardListsInner({ owned: initialOwned, shared, loadError }: Omit<Props, "locale">) {
  const { t } = useT();
  const [owned, setOwned] = useState<ListRow[]>(initialOwned);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ListRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ListRow | null>(null);

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
      <Tabs defaultValue="my-lists" className="w-full">
        <TabsList aria-label={t("dashboardLists.tabsLabel")} className="grid h-11 w-full grid-cols-2">
          <TabsTrigger value="my-lists">{t("dashboardLists.myLists")}</TabsTrigger>
          <TabsTrigger value="shared-lists">{t("dashboardLists.sharedWithMe")}</TabsTrigger>
        </TabsList>

        <TabsContent value="my-lists" className="mt-6">
          {hasOwned && (
            <div className="mb-4 flex justify-end">
              <Button
                onClick={() => {
                  setDialogOpen(true);
                }}
                size="sm"
              >
                <Plus />
                {t("dashboardLists.createList")}
              </Button>
            </div>
          )}

          {hasOwned ? (
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
              {owned.map((list) => (
                <OwnedListCard
                  key={list.id}
                  list={list}
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
            <EmptyHero
              onCreate={() => {
                setDialogOpen(true);
              }}
            />
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
                  <SharedListCard key={list.id} list={list} />
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

function OwnedListCard({ list, onRename, onDelete }: { list: ListRow; onRename: () => void; onDelete: () => void }) {
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
      <div className="absolute top-1/2 right-1 -translate-y-1/2 sm:right-2">
        <ListActionsMenu listTitle={list.title} onRename={onRename} onDelete={onDelete} />
      </div>
    </Card>
  );
}

function SharedListCard({ list }: { list: ListRow }) {
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
    </Card>
  );
}

function EmptyHero({ onCreate }: { onCreate: () => void }) {
  const { t } = useT();
  return (
    <div className="border-muted-foreground/20 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center sm:p-12">
      <ListPlus className="text-muted-foreground size-10" aria-hidden="true" />
      <h3 className="text-lg font-semibold">{t("dashboardLists.emptyTitle")}</h3>
      <p className="text-muted-foreground max-w-sm text-sm">{t("dashboardLists.emptyBody")}</p>
      <Button onClick={onCreate} className="mt-2">
        <Plus />
        {t("dashboardLists.createFirst")}
      </Button>
    </div>
  );
}
