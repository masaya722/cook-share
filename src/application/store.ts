import type { DishInMeal, Meal, MealTime } from "@/domain/menu/meal";
import type { Recipe } from "@/domain/recipe/recipe";
import type { CalendarDate } from "@/domain/shared/calendar-date";
import type { ShoppingMemo } from "@/domain/shopping/shopping-memo";

/** アプリケーション層が使う保存先。本番は Supabase、テストはメモリ上の実装 */
export interface Store {
  loadRecipe(id: string): Promise<Recipe | null>;
  /** レシピを保存する。mode が insert なら新しく作り、update なら上書きする */
  saveRecipe(recipe: Recipe, mode: "insert" | "update"): Promise<void>;

  loadMeal(date: CalendarDate, mealTime: MealTime): Promise<Meal | null>;
  loadMealOfDish(dishId: string): Promise<Meal | null>;
  loadMealsWithDishesOfRecipe(recipeId: string): Promise<Meal[]>;
  /** 指定した品を残り物として並べている食事 */
  loadMealsWithLeftoversOf(dishIds: readonly string[]): Promise<Meal[]>;
  /** from〜to（両端を含む）の献立の品 */
  loadDishesBetween(from: CalendarDate, to: CalendarDate): Promise<DishInMeal[]>;

  loadShoppingMemo(): Promise<ShoppingMemo>;
  /**
   * 買い物メモを保存する。保存されているメモの番号が expectedVersion のときだけ保存し、新しい番号を返す。
   * 相手が先に保存していて番号が違えば保存せず null を返す。
   */
  saveShoppingMemo(memo: ShoppingMemo, expectedVersion: number): Promise<number | null>;

  /** 食事の変更（とレシピの削除）を 1 つのトランザクションで保存する。空になった食事は消す */
  save(changes: { meals?: readonly Meal[]; recipesDelete?: readonly string[] }): Promise<void>;
}
