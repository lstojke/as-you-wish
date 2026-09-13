import type { ItemRow } from "@/lib/services/items";
import ItemActionsMenu from "@/components/lists/ItemActionsMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Props {
  items: ItemRow[];
  reservedItemIds: string[];
  myReservedItemIds: string[];
  pendingItemIds: string[];
  canClaim: boolean;
  ownedByCurrentUser: boolean;
  onEdit: (item: ItemRow) => void;
  onDelete: (item: ItemRow) => void;
  onReserve: (item: ItemRow) => void;
  onRelease: (item: ItemRow) => void;
}

function formatPrice(priceCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(priceCents / 100);
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency}`;
  }
}

export default function ItemsList({
  items,
  reservedItemIds,
  myReservedItemIds,
  pendingItemIds,
  canClaim,
  ownedByCurrentUser,
  onEdit,
  onDelete,
  onReserve,
  onRelease,
}: Props) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">No items yet. Add your first below.</p>;
  }

  const reserved = new Set(reservedItemIds);
  const myReserved = new Set(myReservedItemIds);
  const pending = new Set(pendingItemIds);

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="border-border flex items-start justify-between gap-2 rounded-lg border px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{item.title}</span>
              {myReserved.has(item.id) ? (
                <Badge>Reserved by you</Badge>
              ) : reserved.has(item.id) ? (
                <Badge variant="secondary">Reserved</Badge>
              ) : (
                <Badge variant="outline">Available</Badge>
              )}
            </div>
            {item.price_cents !== null && item.currency !== null && (
              <span className="text-muted-foreground text-sm">{formatPrice(item.price_cents, item.currency)}</span>
            )}
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary truncate text-sm underline-offset-4 hover:underline"
              >
                {item.link}
              </a>
            )}
          </div>
          {ownedByCurrentUser && (
            <ItemActionsMenu
              itemTitle={item.title}
              onEdit={() => {
                onEdit(item);
              }}
              onDelete={() => {
                onDelete(item);
              }}
            />
          )}
          {canClaim &&
            (myReserved.has(item.id) ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending.has(item.id)}
                onClick={() => {
                  onRelease(item);
                }}
              >
                {pending.has(item.id) ? "Cancelling…" : "Cancel"}
              </Button>
            ) : reserved.has(item.id) ? null : (
              <Button
                type="button"
                size="sm"
                disabled={pending.has(item.id)}
                onClick={() => {
                  onReserve(item);
                }}
              >
                {pending.has(item.id) ? "Reserving…" : "Reserve"}
              </Button>
            ))}
        </li>
      ))}
    </ul>
  );
}
