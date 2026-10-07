import { type DishId, type DishInMeal, Meal, type MealTime, type MenuEvent } from "@/domain/menu/meal";
import type { Recipe, RecipeId } from "@/domain/recipe/recipe";
import { HOUSEHOLD_SERVINGS } from "@/domain/recipe/servings";
import { type CalendarDate, compareDates } from "@/domain/shared/calendar-date";
import { DomainError } from "@/domain/shared/domain-error";
import { applyMenuEvents } from "@/domain/shopping/menu-policy";
import type { ShoppingItem, ShoppingItemId, ShoppingList } from "@/domain/shopping/shopping-list";
import type { Store } from "./store";

/** 新しく作るものの id。テストでは決まった値を渡せるようにする */
export type NewId = () => string;

async function recipesFor(store: Store, events: readonly MenuEvent[]) {
  const recipes = new Map<string, Recipe>();
  for (const e of events) {
    if (e.type !== "DishAdded" || recipes.has(e.recipeId)) continue;
    const recipe = await store.loadRecipe(e.recipeId);
    if (!recipe) throw new DomainError("レシピが見つかりません");
    recipes.set(e.recipeId, recipe);
  }
  return (id: RecipeId) => recipes.get(id)!;
}

/**
 * 献立を変える操作の共通の流れ:
 * 食事を変える → 外れた品を残り物にしていた食事からも外す（M7）→ 買い物リストに反映 → まとめて保存
 */
async function changeMeals(store: Store, meals: Meal[], extra: { recipesDelete?: string[] } = {}) {
  const events = meals.flatMap((m) => m.pullEvents());

  const removedDishIds = events.filter((e) => e.type === "DishRemoved").map((e) => e.dishId);
  const affected: Meal[] = [];
  if (removedDishIds.length > 0) {
    for (const other of await store.loadMealsWithLeftoversOf(removedDishIds)) {
      const meal = meals.find((m) => m.id === other.id) ?? other;
      for (const id of removedDishIds) meal.removeLeftover(id);
      meal.pullEvents();
      if (!meals.includes(meal)) affected.push(meal);
    }
  }

  const [list, recipeOf] = await Promise.all([store.loadShoppingList(), recipesFor(store, events)]);
  applyMenuEvents(list, events, recipeOf);

  await store.save({ meals: [...meals, ...affected], shopping: list.pullChanges(), ...extra });
}

async function mealAt(store: Store, date: CalendarDate, mealTime: MealTime, newId: NewId) {
  return (await store.loadMeal(date, mealTime)) ?? Meal.plan(newId(), date, mealTime);
}

async function mealOfDish(store: Store, dishId: string) {
  const meal = await store.loadMealOfDish(dishId);
  if (!meal) throw new DomainError("この品は献立にありません");
  return meal;
}

/** 献立に品を加える。材料は作る人数に合わせて自動で買い物リストに入る */
export async function planDish(
  store: Store,
  input: { date: CalendarDate; mealTime: MealTime; recipeId: string; servingsToCook?: number },
  newId: NewId,
) {
  const meal = await mealAt(store, input.date, input.mealTime, newId);
  meal.addDish(newId(), input.recipeId as RecipeId, input.servingsToCook ?? HOUSEHOLD_SERVINGS);
  await changeMeals(store, [meal]);
}

/** 献立から品を外す。まだ買っていない材料は買い物リストから消え、この品の残り物も外れる */
export async function removeDish(store: Store, dishId: string) {
  const meal = await store.loadMealOfDish(dishId);
  if (!meal) return;
  meal.removeDish(dishId as DishId);
  await changeMeals(store, [meal]);
}

/** 作る人数を変える。買い物リストの分量も合わせて変わる */
export async function changeServings(store: Store, dishId: string, servingsToCook: number) {
  const meal = await mealOfDish(store, dishId);
  if (servingsToCook <= HOUSEHOLD_SERVINGS) {
    const usedAsLeftover = await store.loadMealsWithLeftoversOf([dishId]);
    if (usedAsLeftover.length > 0) {
      throw new DomainError("残り物として献立に入れている日があります。先にその残り物を外してください");
    }
  }
  meal.changeServings(dishId as DishId, servingsToCook);
  await changeMeals(store, [meal]);
}

/** 外食にする。並んでいた品と残り物は外れ、まだ買っていない材料は買い物リストから消える */
export async function markEatingOut(store: Store, input: { date: CalendarDate; mealTime: MealTime }, newId: NewId) {
  const meal = await mealAt(store, input.date, input.mealTime, newId);
  meal.markEatingOut();
  await changeMeals(store, [meal]);
}

export async function cancelEatingOut(store: Store, input: { date: CalendarDate; mealTime: MealTime }) {
  const meal = await store.loadMeal(input.date, input.mealTime);
  if (!meal) return;
  meal.cancelEatingOut();
  await changeMeals(store, [meal]);
}

/** 前の食事で多めに作った品を、残り物として献立に入れる（買い物は増えない） */
export async function addLeftover(
  store: Store,
  input: { date: CalendarDate; mealTime: MealTime; sourceDishId: string },
  newId: NewId,
) {
  const sourceMeal = await mealOfDish(store, input.sourceDishId);
  const sourceDish = sourceMeal.dishes.find((d) => d.id === input.sourceDishId)!;
  const meal = await mealAt(store, input.date, input.mealTime, newId);
  meal.addLeftover({ ...sourceDish, date: sourceMeal.date, mealTime: sourceMeal.mealTime });
  await changeMeals(store, [meal]);
}

export async function removeLeftover(
  store: Store,
  input: { date: CalendarDate; mealTime: MealTime; sourceDishId: string },
) {
  const meal = await store.loadMeal(input.date, input.mealTime);
  if (!meal) return;
  meal.removeLeftover(input.sourceDishId as DishId);
  await changeMeals(store, [meal]);
}

/** R5: 今日以降の献立でこのレシピを使っている食事（削除前の確認に使う） */
export async function upcomingUsesOfRecipe(store: Store, recipeId: string, today: CalendarDate) {
  const meals = await store.loadMealsWithDishesOfRecipe(recipeId);
  return meals
    .filter((m) => compareDates(m.date, today) >= 0)
    .map((m) => ({ date: m.date, mealTime: m.mealTime }))
    .sort((a, b) => compareDates(a.date, b.date));
}

/** レシピを削除する。献立からも消え、まだ買っていない材料は買い物リストからも消える */
export async function deleteRecipe(store: Store, recipeId: string) {
  const meals = await store.loadMealsWithDishesOfRecipe(recipeId);
  for (const meal of meals) {
    for (const dish of meal.dishes.filter((d) => d.recipeId === recipeId)) meal.removeDish(dish.id);
  }
  await changeMeals(store, meals, { recipesDelete: [recipeId] });
}

/**
 * 買い物リストを開く。
 * - 初回だけ、今日以降の献立の材料を買い物リストに入れる（買い物リストを保存する前に決めた献立のため）
 * - 前日までに買った物を消す
 */
export async function openShoppingList(store: Store, today: CalendarDate): Promise<ShoppingItem[]> {
  const [list, backfilled] = await Promise.all([store.loadShoppingList(), store.isShoppingListBackfilled()]);
  if (!backfilled) await backfill(store, list, await store.loadDishesFrom(today));
  list.purgeBought(today);

  const changes = list.pullChanges();
  if (!backfilled || changes.upserted.length || changes.removedIds.length) {
    await store.save({ shopping: changes, markBackfilled: !backfilled });
  }
  return [...list.all()];
}

async function backfill(store: Store, list: ShoppingList, dishes: DishInMeal[]) {
  const events: MenuEvent[] = dishes.map((d) => ({
    type: "DishAdded",
    dishId: d.id,
    recipeId: d.recipeId,
    servingsToCook: d.servingsToCook,
    date: d.date,
    mealTime: d.mealTime,
  }));
  applyMenuEvents(list, events, await recipesFor(store, events));
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
