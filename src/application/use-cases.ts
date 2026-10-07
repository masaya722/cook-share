import { type DishId, Meal, type MealTime } from "@/domain/menu/meal";
import type { Recipe, RecipeId } from "@/domain/recipe/recipe";
import { HOUSEHOLD_SERVINGS } from "@/domain/recipe/servings";
import type { CalendarDate } from "@/domain/shared/calendar-date";
import { DomainError } from "@/domain/shared/domain-error";
import { applyMenuEvents } from "@/domain/shopping/menu-policy";
import type { ShoppingItem, ShoppingItemId } from "@/domain/shopping/shopping-list";
import type { PlannedDish, Store } from "./store";

/** 今の献立テーブルから食事を組み立てる（品はすべて 2 人分。作る人数は第 3 段階で持たせる） */
function mealOf(date: CalendarDate, mealTime: MealTime, dishes: PlannedDish[]): Meal {
  return Meal.reconstitute({
    id: `${date}:${mealTime}`,
    date,
    mealTime,
    eatingOut: false,
    dishes: dishes.map((d) => ({
      id: d.id as DishId,
      recipeId: d.recipeId as RecipeId,
      servingsToCook: HOUSEHOLD_SERVINGS,
    })),
    leftovers: [],
  });
}

async function recipeLoader(store: Store) {
  const recipes = new Map<string, Recipe>();
  return {
    async preload(ids: string[]) {
      for (const id of new Set(ids)) {
        if (recipes.has(id)) continue;
        const recipe = await store.loadRecipe(id);
        if (!recipe) throw new DomainError("レシピが見つかりません");
        recipes.set(id, recipe);
      }
    },
    get: (id: RecipeId) => recipes.get(id)!,
  };
}

/** 献立に品を加える。材料は自動で買い物リストに入る */
export async function planDish(
  store: Store,
  input: { dishId: string; date: CalendarDate; mealTime: MealTime; recipeId: string },
) {
  const [existing, list, recipes] = await Promise.all([
    store.loadDishesOfMeal(input.date, input.mealTime),
    store.loadShoppingList(),
    recipeLoader(store),
  ]);
  await recipes.preload([input.recipeId]);

  const meal = mealOf(input.date, input.mealTime, existing);
  meal.addDish(input.dishId, input.recipeId as RecipeId);
  applyMenuEvents(list, meal.pullEvents(), recipes.get);

  await store.save({
    menu: { dishesInsert: [{ id: input.dishId, date: input.date, mealTime: input.mealTime, recipeId: input.recipeId }] },
    shopping: list.pullChanges(),
  });
}

/** 献立から品を外す。その品の材料のうち、まだ買っていない物は買い物リストから消える */
export async function removeDish(store: Store, dishId: string) {
  const dish = await store.loadDish(dishId);
  if (!dish) return;
  const [dishes, list] = await Promise.all([
    store.loadDishesOfMeal(dish.date, dish.mealTime),
    store.loadShoppingList(),
  ]);

  const meal = mealOf(dish.date, dish.mealTime, dishes);
  meal.removeDish(dishId as DishId);
  applyMenuEvents(list, meal.pullEvents(), () => {
    throw new Error("品を外すときにレシピは使わない");
  });

  await store.save({ menu: { dishesDelete: [dishId] }, shopping: list.pullChanges() });
}

/** レシピを削除する。献立からも消え、まだ買っていない材料も買い物リストから消える */
export async function deleteRecipe(store: Store, recipeId: string) {
  const [dishes, list] = await Promise.all([store.loadDishesOfRecipe(recipeId), store.loadShoppingList()]);
  for (const dish of dishes) list.removeDish(dish.id as DishId);
  await store.save({
    menu: { dishesDelete: dishes.map((d) => d.id), recipesDelete: [recipeId] },
    shopping: list.pullChanges(),
  });
}

/**
 * 買い物リストを開く。
 * - 初回だけ、今日以降の献立の材料を買い物リストに入れる（買い物リストを保存する前に決めた献立のため）
 * - 前日までに買った物を消す
 */
export async function openShoppingList(store: Store, today: CalendarDate): Promise<ShoppingItem[]> {
  const [list, backfilled] = await Promise.all([store.loadShoppingList(), store.isShoppingListBackfilled()]);

  if (!backfilled) {
    const dishes = await store.loadDishesFrom(today);
    const recipes = await recipeLoader(store);
    await recipes.preload(dishes.map((d) => d.recipeId));
    for (const dish of dishes) {
      const meal = mealOf(dish.date, dish.mealTime, []);
      meal.addDish(dish.id, dish.recipeId as RecipeId);
      applyMenuEvents(list, meal.pullEvents(), recipes.get);
    }
  }
  list.purgeBought(today);

  const changes = list.pullChanges();
  if (!backfilled || changes.upserted.length || changes.removedIds.length) {
    await store.save({ shopping: changes, markBackfilled: !backfilled });
  }
  return [...list.all()];
}

/** 牛乳・バナナ・代わりの食材などを手で足す */
export async function addShoppingItem(store: Store, input: { food: string; quantity?: string }) {
  const list = await store.loadShoppingList();
  const item = list.addManual(input);
  await store.save({ shopping: list.pullChanges() });
  return item;
}

export async function markBought(store: Store, ids: string[], today: CalendarDate) {
  const list = await store.loadShoppingList();
  list.markBought(existing(list.all(), ids), today);
  await store.save({ shopping: list.pullChanges() });
}

export async function unmarkBought(store: Store, ids: string[]) {
  const list = await store.loadShoppingList();
  list.unmarkBought(existing(list.all(), ids));
  await store.save({ shopping: list.pullChanges() });
}

export async function removeShoppingItems(store: Store, ids: string[]) {
  const list = await store.loadShoppingList();
  list.remove(ids as ShoppingItemId[]);
  await store.save({ shopping: list.pullChanges() });
}

/** 2 人で同時に操作したとき、相手がすでに消した買う物は無視する */
function existing(items: readonly ShoppingItem[], ids: string[]): ShoppingItemId[] {
  const known = new Set<string>(items.map((i) => i.id));
  return ids.filter((id) => known.has(id)) as ShoppingItemId[];
}
