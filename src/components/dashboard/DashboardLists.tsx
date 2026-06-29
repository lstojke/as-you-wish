import { useState } from "react";
import { Plus, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import CreateListDialog from "@/components/dashboard/CreateListDialog";
import ListActionsMenu from "@/components/dashboard/ListActionsMenu";
import RenameListDialog from "@/components/dashboard/RenameListDialog";
import DeleteListDialog from "@/components/dashboard/DeleteListDialog";
import type { ListRow } from "@/lib/services/lists";

interface Props {
  owned: ListRow[];
  shared: ListRow[];
}

export default function DashboardLists({ owned: initialOwned, shared }: Props) {
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

  return (
    <div className="space-y-12">
      <section aria-labelledby="my-lists-heading">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="my-lists-heading" className="text-xl font-semibold tracking-tight">
            My lists
          </h2>
          {hasOwned && (
            <Button
              onClick={() => {
                setDialogOpen(true);
              }}
              size="sm"
            >
              <Plus />
              Create list
            </Button>
          )}
        </div>

        {hasOwned ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </section>

      {hasShared && (
        <section aria-labelledby="shared-heading">
          <h2 id="shared-heading" className="mb-4 text-xl font-semibold tracking-tight">
            Shared with me
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shared.map((list) => (
              <SharedListCard key={list.id} list={list} />
            ))}
          </div>
        </section>
      )}

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

function OwnedListCard({ list, onRename, onDelete }: { list: ListRow; onRename: () => void; onDelete: () => void }) {
  return (
    <a
      href={`/lists/${list.id}`}
      className="focus-visible:ring-ring/50 block rounded-xl outline-none focus-visible:ring-[3px]"
      aria-label={`Open list ${list.title}`}
    >
      <Card className="hover:border-foreground/20 transition-colors">
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="min-w-0 flex-1 truncate text-base">{list.title}</CardTitle>
          <ListActionsMenu listTitle={list.title} onRename={onRename} onDelete={onDelete} />
        </CardHeader>
      </Card>
    </a>
  );
}

function SharedListCard({ list }: { list: ListRow }) {
  return (
    <a
      href={`/lists/${list.id}`}
      className="focus-visible:ring-ring/50 block rounded-xl outline-none focus-visible:ring-[3px]"
      aria-label={`Open list ${list.title}`}
    >
      <Card className="hover:border-foreground/20 transition-colors">
        <CardHeader>
          <CardTitle className="truncate text-base">{list.title}</CardTitle>
        </CardHeader>
      </Card>
    </a>
  );
}

function EmptyHero({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="border-muted-foreground/20 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
      <ListPlus className="text-muted-foreground size-10" aria-hidden="true" />
      <h3 className="text-lg font-semibold">No lists yet</h3>
      <p className="text-muted-foreground max-w-sm text-sm">
        Wish lists make it easy for the people who shop for you to know what to get — without buying the same thing
        twice.
      </p>
      <Button onClick={onCreate} className="mt-2">
        <Plus />
        Create your first list
      </Button>
    </div>
  );
}
