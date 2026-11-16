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

  it.each([
    ["49,99", 4999],
    ["49,9", 4990],
    ["0,01", 1],
    ["49.99", 4999],
    ["49", 4900],
  ])("accepts %s and maps it to %i cents on create and update", (priceInput, cents) => {
    const values = itemFormSchema.parse({ title: "Shoes", priceInput, link: "", currency: "EUR" });
    expect(mapItemFormToCreate(listId, values)).toMatchObject({ priceCents: cents, currency: "EUR" });
    expect(mapItemFormToUpdate(itemId, values)).toMatchObject({ priceCents: cents, currency: "EUR" });
  });

  it.each(["1,234", "1.234", "1,2.3", "1.2,3", "1,", ",50", "-1,00"])("rejects invalid price %s", (priceInput) => {
    expect(itemFormSchema.safeParse({ title: "Shoes", priceInput, link: "", currency: "EUR" }).success).toBe(false);
  });
});
