import type { MealTime } from "@/domain/menu/meal";
import type { Recipe } from "@/domain/recipe/recipe";
import { type CalendarDate, compareDates } from "@/domain/shared/calendar-date";
import { type ShoppingItem, ShoppingList } from "@/domain/shopping/shopping-list";
import type { PlannedDish, Store } from "./store";

/** テスト用のメモリ上の保存先 */
export class InMemoryStore implements Store {
  recipes = new Map<string, Recipe>();
  dishes = new Map<string, PlannedDish>();
  items = new Map<string, ShoppingItem>();
  backfilled = false;
  private seq = 0;

  async loadRecipe(id: string) {
    return this.recipes.get(id) ?? null;
  }
  async loadDish(id: string) {
    return this.dishes.get(id) ?? null;
  }
  async loadDishesOfMeal(date: CalendarDate, mealTime: MealTime) {
    return [...this.dishes.values()].filter((d) => d.date === date && d.mealTime === mealTime);
  }
  async loadDishesOfRecipe(recipeId: string) {
    return [...this.dishes.values()].filter((d) => d.recipeId === recipeId);
  }
  async loadDishesFrom(date: CalendarDate) {
    return [...this.dishes.values()].filter((d) => compareDates(d.date, date) >= 0);
  }
  async loadShoppingList() {
    return ShoppingList.reconstitute([...this.items.values()], () => `item-${++this.seq}`);
  }
  async isShoppingListBackfilled() {
    return this.backfilled;
  }
  async save(changes: Parameters<Store["save"]>[0]) {
    for (const d of changes.menu?.dishesInsert ?? []) this.dishes.set(d.id, d);
    for (const id of changes.menu?.dishesDelete ?? []) this.dishes.delete(id);
    for (const id of changes.menu?.recipesDelete ?? []) {
      this.recipes.delete(id);
      // レシピを消すと献立からも消える（DB の on delete cascade と同じ）
      for (const d of this.dishes.values()) if (d.recipeId === id) this.dishes.delete(d.id);
    }
    for (const item of changes.shopping?.upserted ?? []) this.items.set(item.id, item);
    for (const id of changes.shopping?.removedIds ?? []) this.items.delete(id);
    if (changes.markBackfilled) this.backfilled = true;
  }
}
