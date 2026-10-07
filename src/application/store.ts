import type { MealTime } from "@/domain/menu/meal";
import type { Recipe } from "@/domain/recipe/recipe";
import type { CalendarDate } from "@/domain/shared/calendar-date";
import type { ShoppingList, ShoppingListChanges } from "@/domain/shopping/shopping-list";

/** 今の献立テーブル（meal_plans）の 1 行 = 品 1 つ。作る人数や外食は第 3 段階で持たせる */
export type PlannedDish = {
  id: string;
  date: CalendarDate;
  mealTime: MealTime;
  recipeId: string;
};

export type MenuChanges = {
  dishesInsert: PlannedDish[];
  dishesDelete: string[];
  recipesDelete: string[];
};

/** アプリケーション層が使う保存先。本番は Supabase、テストはメモリ上の実装 */
export interface Store {
  loadRecipe(id: string): Promise<Recipe | null>;
  loadDish(id: string): Promise<PlannedDish | null>;
  loadDishesOfMeal(date: CalendarDate, mealTime: MealTime): Promise<PlannedDish[]>;
  loadDishesOfRecipe(recipeId: string): Promise<PlannedDish[]>;
  loadDishesFrom(date: CalendarDate): Promise<PlannedDish[]>;
  loadShoppingList(): Promise<ShoppingList>;
  isShoppingListBackfilled(): Promise<boolean>;
  /** 献立と買い物リストの変更を 1 つのトランザクションで保存する */
  save(changes: {
    menu?: Partial<MenuChanges>;
    shopping?: ShoppingListChanges;
    markBackfilled?: boolean;
  }): Promise<void>;
}
