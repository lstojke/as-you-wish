import type { ItemRow } from "@/lib/services/items";

interface Props {
  items: ItemRow[];
}

function formatPrice(priceCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(priceCents / 100);
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency}`;
  }
}

export default function ItemsList({ items }: Props) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">No items yet. Add your first below.</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="border-border flex flex-col gap-1 rounded-lg border px-4 py-3">
          <span className="font-medium">{item.title}</span>
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
        </li>
      ))}
    </ul>
  );
}
