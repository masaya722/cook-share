import type { SupabaseClient } from "@supabase/supabase-js";
import type { Store } from "@/application/store";
import { type DishId, type DishInMeal, Meal, type MealTime } from "@/domain/menu/meal";
import type { Recipe, RecipeId } from "@/domain/recipe/recipe";
import type { CalendarDate } from "@/domain/shared/calendar-date";
import { ShoppingMemo } from "@/domain/shopping/shopping-memo";
import type { RecipeRow } from "@/lib/types";
import { toDomainRecipe, toRecipeRow } from "./recipe-mapper";

// meals と dishes は「食事の品」と「残り物（leftovers 経由）」の 2 通りでつながるので、使う外部キーを明示する。
// leftovers 側はつながり方が 1 通りなので指定しない（「!leftovers_...」は PostgREST が「!left」結合と読んでしまう）
const MEAL_SELECT = `
  id, date, meal_time, eating_out,
  dishes!dishes_meal_id_fkey(id, recipe_id, servings_to_cook, created_at),
  leftovers(source_dish_id, created_at, source:dishes(recipe_id))
`;

type MealRow = {
  id: string;
  date: string;
  meal_time: MealTime;
  eating_out: boolean;
  dishes: { id: string; recipe_id: string; servings_to_cook: number; created_at: string }[];
  leftovers: { source_dish_id: string; created_at: string; source: { recipe_id: string } | null }[];
};

const byCreatedAt = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at);

function toMeal(row: MealRow): Meal {
  return Meal.reconstitute({
    id: row.id,
    date: row.date as CalendarDate,
    mealTime: row.meal_time,
    eatingOut: row.eating_out,
    dishes: [...row.dishes].sort(byCreatedAt).map((d) => ({
      id: d.id as DishId,
      recipeId: d.recipe_id as RecipeId,
      servingsToCook: d.servings_to_cook,
    })),
    leftovers: [...row.leftovers]
      .sort(byCreatedAt)
      .filter((l) => l.source)
      .map((l) => ({ sourceDishId: l.source_dish_id as DishId, recipeId: l.source!.recipe_id as RecipeId })),
  });
}

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

  async saveRecipe(recipe: Recipe, mode: "insert" | "update") {
    const row = toRecipeRow(recipe);
    check(
      mode === "insert"
        ? await this.db.from("recipes").insert({ id: recipe.id, ...row }).select("id").single()
        : await this.db.from("recipes").update(row).eq("id", recipe.id).select("id").single(),
    );
  }

  async loadMeal(date: CalendarDate, mealTime: MealTime) {
    const row = check(
      await this.db.from("meals").select(MEAL_SELECT).eq("date", date).eq("meal_time", mealTime).maybeSingle(),
    );
    return row ? toMeal(row as unknown as MealRow) : null;
  }

  private async loadMealsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    const rows = check(await this.db.from("meals").select(MEAL_SELECT).in("id", [...new Set(ids)]));
    return (rows as unknown as MealRow[]).map(toMeal);
  }

  async loadMealOfDish(dishId: string) {
    const row = check(await this.db.from("dishes").select("meal_id").eq("id", dishId).maybeSingle());
    return row ? ((await this.loadMealsByIds([row.meal_id]))[0] ?? null) : null;
  }

  async loadMealsWithDishesOfRecipe(recipeId: string) {
    const rows = check(await this.db.from("dishes").select("meal_id").eq("recipe_id", recipeId));
    return this.loadMealsByIds((rows ?? []).map((r) => r.meal_id));
  }

  async loadMealsWithLeftoversOf(dishIds: readonly string[]) {
    if (dishIds.length === 0) return [];
    const rows = check(await this.db.from("leftovers").select("meal_id").in("source_dish_id", [...dishIds]));
    return this.loadMealsByIds((rows ?? []).map((r) => r.meal_id));
  }

  async loadDishesBetween(from: CalendarDate, to: CalendarDate): Promise<DishInMeal[]> {
    const rows = check(
      await this.db
        .from("dishes")
        .select("id, recipe_id, servings_to_cook, meal:meals!dishes_meal_id_fkey!inner(date, meal_time)")
        .gte("meal.date", from)
        .lte("meal.date", to),
    ) as unknown as { id: string; recipe_id: string; servings_to_cook: number; meal: { date: string; meal_time: MealTime } }[];
    return rows.map((r) => ({
      id: r.id as DishId,
      recipeId: r.recipe_id as RecipeId,
      servingsToCook: r.servings_to_cook,
      date: r.meal.date as CalendarDate,
      mealTime: r.meal.meal_time,
    }));
  }

  async loadShoppingMemo() {
    const row = check(
      await this.db.from("shopping_memo").select("text, reflected_dish_ids, version").maybeSingle(),
    ) as { text: string; reflected_dish_ids: string[]; version: number } | null;
    if (!row) throw new Error("買い物メモがありません（0008 の SQL を実行してください）");
    return ShoppingMemo.reconstitute({ text: row.text, reflectedDishIds: row.reflected_dish_ids, version: row.version });
  }

  async saveShoppingMemo(memo: ShoppingMemo, expectedVersion: number) {
    const saved = check(
      await this.db.rpc("save_shopping_memo", {
        new_text: memo.text,
        new_reflected: memo.reflectedDishIds,
        expected_version: expectedVersion,
      }),
    ) as number | null;
    return saved ?? null;
  }

  async save(changes: Parameters<Store["save"]>[0]) {
    const meals = changes.meals ?? [];
    check(
      await this.db.rpc("save_meals_and_shopping", {
        changes: {
          meals_save: meals
            .filter((m) => !m.isEmpty)
            .map((m) => ({
              id: m.id,
              date: m.date,
              meal_time: m.mealTime,
              eating_out: m.eatingOut,
              dishes: m.dishes.map((d) => ({ id: d.id, recipe_id: d.recipeId, servings_to_cook: d.servingsToCook })),
              leftovers: m.leftovers.map((l) => ({ source_dish_id: l.sourceDishId })),
            })),
          meals_delete: meals.filter((m) => m.isEmpty).map((m) => m.id),
          recipes_delete: changes.recipesDelete ?? [],
        },
      }),
    );
  }
}
