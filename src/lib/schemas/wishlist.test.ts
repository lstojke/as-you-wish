import { describe, expect, it } from "vitest";
import { itemFormSchema, mapItemFormToCreate, mapItemFormToUpdate } from "@/lib/schemas/wishlist";

const listId = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";

describe("item form currency mapping", () => {
  it("sends the selected currency when a price is set", () => {
    const values = { title: "Shoes", priceInput: "49.99", link: "", currency: "EUR" };
    expect(mapItemFormToCreate(listId, values)).toMatchObject({ priceCents: 4999, currency: "EUR" });
    expect(mapItemFormToUpdate(itemId, values)).toMatchObject({ priceCents: 4999, currency: "EUR" });
  });

  it("omits currency when there is no price", () => {
    const values = { title: "Shoes", priceInput: "", link: "", currency: "EUR" };
    expect(mapItemFormToCreate(listId, values).currency).toBeUndefined();
    expect(mapItemFormToUpdate(itemId, values).currency).toBeUndefined();
  });

  it("rejects a malformed currency", () => {
    expect(itemFormSchema.safeParse({ title: "Shoes", priceInput: "1", link: "", currency: "eur" }).success).toBe(
      false,
    );
  });
});
