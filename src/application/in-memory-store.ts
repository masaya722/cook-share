import { type DishInMeal, Meal, type MealTime } from "@/domain/menu/meal";
import type { Recipe } from "@/domain/recipe/recipe";
import { type CalendarDate, compareDates } from "@/domain/shared/calendar-date";
import { type ShoppingItem, ShoppingList } from "@/domain/shopping/shopping-list";
import type { Store } from "./store";

type MealSnapshot = {
  id: string;
  date: CalendarDate;
  mealTime: MealTime;
  eatingOut: boolean;
  dishes: Meal["dishes"][number][];
  leftovers: Meal["leftovers"][number][];
};

/** テスト用のメモリ上の保存先。DB と同じく、保存した食事は読み直すと別のオブジェクトになる */
export class InMemoryStore implements Store {
  recipes = new Map<string, Recipe>();
  meals = new Map<string, MealSnapshot>();
  items = new Map<string, ShoppingItem>();
  backfilled = false;
  private seq = 0;

  private load(snapshot: MealSnapshot) {
    return Meal.reconstitute(structuredClone(snapshot));
  }

  async loadRecipe(id: string) {
    return this.recipes.get(id) ?? null;
  }
  async loadMeal(date: CalendarDate, mealTime: MealTime) {
    const s = [...this.meals.values()].find((m) => m.date === date && m.mealTime === mealTime);
    return s ? this.load(s) : null;
  }
  async loadMealOfDish(dishId: string) {
    const s = [...this.meals.values()].find((m) => m.dishes.some((d) => d.id === dishId));
    return s ? this.load(s) : null;
  }
  async loadMealsWithDishesOfRecipe(recipeId: string) {
    return [...this.meals.values()].filter((m) => m.dishes.some((d) => d.recipeId === recipeId)).map((s) => this.load(s));
  }
  async loadMealsWithLeftoversOf(dishIds: readonly string[]) {
    return [...this.meals.values()]
      .filter((m) => m.leftovers.some((l) => dishIds.includes(l.sourceDishId)))
      .map((s) => this.load(s));
  }
  async loadDishesFrom(date: CalendarDate): Promise<DishInMeal[]> {
    return [...this.meals.values()]
      .filter((m) => compareDates(m.date, date) >= 0)
      .flatMap((m) => m.dishes.map((d) => ({ ...d, date: m.date, mealTime: m.mealTime })));
  }
  async loadShoppingList() {
    return ShoppingList.reconstitute([...this.items.values()], () => `item-${++this.seq}`);
  }
  async isShoppingListBackfilled() {
    return this.backfilled;
  }

  /** 献立の品をすべて並べる（テストの確認用） */
  allDishes() {
    return [...this.meals.values()].flatMap((m) => m.dishes);
  }

  async save(changes: Parameters<Store["save"]>[0]) {
    for (const meal of changes.meals ?? []) {
      if (meal.isEmpty) this.meals.delete(meal.id);
      else
        this.meals.set(meal.id, {
          id: meal.id,
          date: meal.date,
          mealTime: meal.mealTime,
          eatingOut: meal.eatingOut,
          dishes: [...meal.dishes],
          leftovers: [...meal.leftovers],
        });
    }
    for (const id of changes.recipesDelete ?? []) this.recipes.delete(id);
    for (const item of changes.shopping?.upserted ?? []) this.items.set(item.id, item);
    for (const id of changes.shopping?.removedIds ?? []) this.items.delete(id);
    if (changes.markBackfilled) this.backfilled = true;
  }
}
