import type { DishInMeal, Meal, MealTime } from "@/domain/menu/meal";
import type { Recipe } from "@/domain/recipe/recipe";
import type { CalendarDate } from "@/domain/shared/calendar-date";
import type { ShoppingList, ShoppingListChanges } from "@/domain/shopping/shopping-list";

/** アプリケーション層が使う保存先。本番は Supabase、テストはメモリ上の実装 */
export interface Store {
  loadRecipe(id: string): Promise<Recipe | null>;

  loadMeal(date: CalendarDate, mealTime: MealTime): Promise<Meal | null>;
  loadMealOfDish(dishId: string): Promise<Meal | null>;
  loadMealsWithDishesOfRecipe(recipeId: string): Promise<Meal[]>;
  /** 指定した品を残り物として並べている食事 */
  loadMealsWithLeftoversOf(dishIds: readonly string[]): Promise<Meal[]>;
  loadDishesFrom(date: CalendarDate): Promise<DishInMeal[]>;

  loadShoppingList(): Promise<ShoppingList>;
  isShoppingListBackfilled(): Promise<boolean>;

  /**
   * 食事と買い物リストの変更を 1 つのトランザクションで保存する。
   * meals は食事の全体を保存し、空になった食事（品も残り物もなく外食でもない）は消す。
   */
  save(changes: {
    meals?: readonly Meal[];
    recipesDelete?: readonly string[];
    shopping?: ShoppingListChanges;
    markBackfilled?: boolean;
  }): Promise<void>;
}
