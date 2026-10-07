import type { DishId } from "@/domain/menu/meal";
import { Food } from "@/domain/recipe/food";
import { Quantity } from "@/domain/recipe/quantity";
import type { CalendarDate } from "@/domain/shared/calendar-date";
import type { ShoppingItem, ShoppingItemId } from "@/domain/shopping/shopping-list";

/** shopping_items テーブルの行（画面とサーバーの受け渡しにもこの形を使う） */
export type ShoppingItemRow = {
  id: string;
  food: string;
  quantity: string;
  origin_dish_id: string | null;
  recipe_title: string | null;
  needed_on: string | null;
  bought_on: string | null;
};

export function toShoppingItem(row: ShoppingItemRow): ShoppingItem {
  return {
    id: row.id as ShoppingItemId,
    food: Food.of(row.food),
    quantity: Quantity.parse(row.quantity),
    origin: row.origin_dish_id
      ? { kind: "dish", dishId: row.origin_dish_id as DishId, recipeTitle: row.recipe_title ?? "" }
      : { kind: "manual" },
    neededOn: row.needed_on as CalendarDate | null,
    boughtOn: row.bought_on as CalendarDate | null,
  };
}

export function toShoppingItemRow(item: ShoppingItem): ShoppingItemRow {
  return {
    id: item.id,
    food: item.food.name,
    quantity: Quantity.format(item.quantity),
    origin_dish_id: item.origin.kind === "dish" ? item.origin.dishId : null,
    recipe_title: item.origin.kind === "dish" ? item.origin.recipeTitle : null,
    needed_on: item.neededOn,
    bought_on: item.boughtOn,
  };
}
