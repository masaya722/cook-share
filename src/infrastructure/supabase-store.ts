import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlannedDish, Store } from "@/application/store";
import type { MealTime } from "@/domain/menu/meal";
import type { CalendarDate } from "@/domain/shared/calendar-date";
import { ShoppingList } from "@/domain/shopping/shopping-list";
import type { Recipe as RecipeRow } from "@/lib/types";
import { toDomainRecipe } from "./recipe-mapper";
import { type ShoppingItemRow, toShoppingItem, toShoppingItemRow } from "./shopping-item-mapper";

type MealPlanRow = { id: string; date: string; meal: MealTime; recipe_id: string };

const toDish = (r: MealPlanRow): PlannedDish => ({
  id: r.id,
  date: r.date as CalendarDate,
  mealTime: r.meal,
  recipeId: r.recipe_id,
});

function check<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

/** Supabase に保存する Store。読み書きはすべて RLS（家族だけ）の下で行う */
export class SupabaseStore implements Store {
  constructor(private readonly db: SupabaseClient) {}

  async loadRecipe(id: string) {
    const row = check(
      await this.db.from("recipes").select("id, title, servings, ingredients").eq("id", id).maybeSingle(),
    );
    return row ? toDomainRecipe(row as Pick<RecipeRow, "id" | "title" | "servings" | "ingredients">) : null;
  }

  async loadDish(id: string) {
    const row = check(await this.db.from("meal_plans").select("id, date, meal, recipe_id").eq("id", id).maybeSingle());
    return row ? toDish(row as MealPlanRow) : null;
  }

  async loadDishesOfMeal(date: CalendarDate, mealTime: MealTime) {
    const rows = check(
      await this.db.from("meal_plans").select("id, date, meal, recipe_id").eq("date", date).eq("meal", mealTime),
    );
    return (rows as MealPlanRow[]).map(toDish);
  }

  async loadDishesOfRecipe(recipeId: string) {
    const rows = check(await this.db.from("meal_plans").select("id, date, meal, recipe_id").eq("recipe_id", recipeId));
    return (rows as MealPlanRow[]).map(toDish);
  }

  async loadDishesFrom(date: CalendarDate) {
    const rows = check(await this.db.from("meal_plans").select("id, date, meal, recipe_id").gte("date", date));
    return (rows as MealPlanRow[]).map(toDish);
  }

  async loadShoppingList() {
    const rows = check(
      await this.db
        .from("shopping_items")
        .select("id, food, quantity, origin_dish_id, recipe_title, needed_on, bought_on")
        .order("created_at"),
    );
    return ShoppingList.reconstitute((rows as ShoppingItemRow[]).map(toShoppingItem));
  }

  async isShoppingListBackfilled() {
    const row = check(await this.db.from("household_settings").select("shopping_backfilled_at").maybeSingle());
    return Boolean(row?.shopping_backfilled_at);
  }

  async save(changes: Parameters<Store["save"]>[0]) {
    check(
      await this.db.rpc("save_menu_and_shopping", {
        changes: {
          meal_plans_insert: (changes.menu?.dishesInsert ?? []).map((d) => ({
            id: d.id,
            date: d.date,
            meal: d.mealTime,
            recipe_id: d.recipeId,
          })),
          meal_plans_delete: changes.menu?.dishesDelete ?? [],
          recipes_delete: changes.menu?.recipesDelete ?? [],
          items_upsert: (changes.shopping?.upserted ?? []).map(toShoppingItemRow),
          items_delete: changes.shopping?.removedIds ?? [],
          mark_backfilled: changes.markBackfilled ?? false,
        },
      }),
    );
  }
}
