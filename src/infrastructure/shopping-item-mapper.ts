import type { DishId } from "@/domain/menu/meal";
import { Quantity } from "@/domain/recipe/quantity";
import type { CalendarDate } from "@/domain/shared/calendar-date";
import { ItemName } from "@/domain/shopping/item-name";
import type { ShoppingEntry, ShoppingItemId } from "@/domain/shopping/shopping-list";

/**
 * shopping_items テーブルの行（画面とサーバーの受け渡しにもこの形を使う）。
 * food 列は買い出しの「品名」（食材に限らない）。列名は以前のまま残している。
 */
export type ShoppingItemRow = {
  id: string;
  kind: "item" | "divider";
  food: string;
  quantity: string;
  origin_dish_id: string | null;
  recipe_title: string | null;
  needed_on: string | null;
  bought_on: string | null;
  position: number;
};

export const SHOPPING_ITEM_COLUMNS =
  "id, kind, food, quantity, origin_dish_id, recipe_title, needed_on, bought_on, position";

export function toShoppingEntry(row: ShoppingItemRow): ShoppingEntry {
  const id = row.id as ShoppingItemId;
  if (row.kind === "divider") return { kind: "divider", id, position: row.position };
  return {
    kind: "item",
    id,
    name: ItemName.of(row.food),
    quantity: Quantity.parse(row.quantity),
    origin: row.origin_dish_id
      ? { kind: "dish", dishId: row.origin_dish_id as DishId, recipeTitle: row.recipe_title ?? "" }
      : { kind: "manual" },
    neededOn: row.needed_on as CalendarDate | null,
    boughtOn: row.bought_on as CalendarDate | null,
    position: row.position,
  };
}

export function toShoppingItemRow(entry: ShoppingEntry): ShoppingItemRow {
  if (entry.kind === "divider") {
    return {
      id: entry.id,
      kind: "divider",
      food: "",
      quantity: "",
      origin_dish_id: null,
      recipe_title: null,
      needed_on: null,
      bought_on: null,
      position: entry.position,
    };
  }
  return {
    id: entry.id,
    kind: "item",
    food: entry.name.text,
    quantity: Quantity.format(entry.quantity),
    origin_dish_id: entry.origin.kind === "dish" ? entry.origin.dishId : null,
    recipe_title: entry.origin.kind === "dish" ? entry.origin.recipeTitle : null,
    needed_on: entry.neededOn,
    bought_on: entry.boughtOn,
    position: entry.position,
  };
}
