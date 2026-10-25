import { type DishId, Meal, type MealTime } from "@/domain/menu/meal";
import type { Recipe, RecipeId } from "@/domain/recipe/recipe";
import { HOUSEHOLD_SERVINGS } from "@/domain/recipe/servings";
import { type CalendarDate, compareDates } from "@/domain/shared/calendar-date";
import { DomainError } from "@/domain/shared/domain-error";
import * as menu from "@/domain/menu/menu-service";
import { type DishToReflect, mergeMemoText, type ShoppingMemo } from "@/domain/shopping/shopping-memo";
import type { Store } from "./store";

/** 新しく作るものの id。テストでは決まった値を渡せるようにする */
export type NewId = () => string;

async function loadRecipeOrFail(store: Store, id: string): Promise<Recipe> {
  const recipe = await store.loadRecipe(id);
  if (!recipe) throw new DomainError("レシピが見つかりません");
  return recipe;
}

/**
 * 献立を変える操作の共通の流れ:
 * 食事を変える → 外れた品を残り物にしていた食事からも外す（M7）→ まとめて保存
 * 買い物メモには自動では反映しない（「献立の材料を反映」したときだけ入る）
 */
async function changeMeals(store: Store, meals: Meal[], extra: { recipesDelete?: string[] } = {}) {
  const events = meals.flatMap((m) => m.pullEvents());

  const removedDishIds = events.flatMap((e) => (e.type === "DishRemoved" ? [e.dishId] : []));
  let affected: Meal[] = [];
  if (removedDishIds.length > 0) {
    // 手元で変えている食事を読み直すと変更が失われるので、同じ食事は手元のものを使う
    const loaded = await store.loadMealsWithLeftoversOf(removedDishIds);
    const mealsWithLeftovers = loaded.map((other) => meals.find((m) => m.id === other.id) ?? other);
    const changed = menu.removeLeftoversOfRemovedDishes(events, mealsWithLeftovers);
    events.push(...changed.flatMap((m) => m.pullEvents()));
    affected = changed.filter((m) => !meals.includes(m));
  }

  await store.save({ meals: [...meals, ...affected], ...extra });
}

async function mealAt(store: Store, date: CalendarDate, mealTime: MealTime, newId: NewId) {
  return (await store.loadMeal(date, mealTime)) ?? Meal.plan(newId(), date, mealTime);
}

async function mealOfDish(store: Store, dishId: string) {
  const meal = await store.loadMealOfDish(dishId);
  if (!meal) throw new DomainError("この品は献立にありません");
  return meal;
}

/** 献立に品を加える */
export async function planDish(
  store: Store,
  input: { date: CalendarDate; mealTime: MealTime; recipeId: string; servingsToCook?: number },
  newId: NewId,
) {
  await loadRecipeOrFail(store, input.recipeId);
  const meal = await mealAt(store, input.date, input.mealTime, newId);
  meal.addDish(newId(), input.recipeId as RecipeId, input.servingsToCook ?? HOUSEHOLD_SERVINGS);
  await changeMeals(store, [meal]);
}

/** 献立から品を外す。この品の残り物も外れる */
export async function removeDish(store: Store, dishId: string) {
  const meal = await store.loadMealOfDish(dishId);
  if (!meal) return;
  meal.removeDish(dishId as DishId);
  await changeMeals(store, [meal]);
}

/** 作る人数を変える */
export async function changeServings(store: Store, dishId: string, servingsToCook: number) {
  const [meal, mealsUsingAsLeftover] = await Promise.all([
    mealOfDish(store, dishId),
    store.loadMealsWithLeftoversOf([dishId]),
  ]);
  menu.changeServings(meal, dishId as DishId, servingsToCook, mealsUsingAsLeftover);
  await changeMeals(store, [meal]);
}

/** 外食にする。並んでいた品と残り物は外れる */
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

/** レシピを保存する。ルール（R1・R2・R7）はレシピを作る時点（Recipe.create）で守られている */
export async function saveRecipe(store: Store, recipe: Recipe, mode: "insert" | "update") {
  await store.saveRecipe(recipe, mode);
}

/** R5: 今日以降の献立でこのレシピを使っている食事（削除前の確認に使う） */
export async function upcomingUsesOfRecipe(store: Store, recipeId: string, today: CalendarDate) {
  const meals = await store.loadMealsWithDishesOfRecipe(recipeId);
  return meals
    .filter((m) => compareDates(m.date, today) >= 0)
    .map((m) => ({ date: m.date, mealTime: m.mealTime }))
    .sort((a, b) => compareDates(a.date, b.date));
}

/** レシピを削除する。献立からも消える */
export async function deleteRecipe(store: Store, recipeId: string) {
  const meals = await store.loadMealsWithDishesOfRecipe(recipeId);
  for (const meal of meals) {
    for (const dish of meal.dishes.filter((d) => d.recipeId === recipeId)) meal.removeDish(dish.id);
  }
  await changeMeals(store, meals, { recipesDelete: [recipeId] });
}

// ---- 買い物メモ ----

export async function openShoppingMemo(store: Store): Promise<ShoppingMemo> {
  return store.loadShoppingMemo();
}

/** 保存がぶつかったとき（相手が先に保存した）に、もう一度だけ最新を読み直してやり直す */
async function saveWithRetry(store: Store, build: (latest: ShoppingMemo) => ShoppingMemo): Promise<ShoppingMemo> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await store.loadShoppingMemo();
    const next = build(latest);
    const version = await store.saveShoppingMemo(next, latest.version);
    if (version !== null) return next.withVersion(version);
  }
  throw new DomainError("もう一人が同時に書き換えています。少し待ってからもう一度試してください");
}

/**
 * メモを保存する。baseText・baseVersion は手元で書き始めたときの内容。
 * 相手がその後に保存していたら、行単位でまとめてから保存する（両方が足した行はどちらも残る）。
 */
export async function saveShoppingMemoText(
  store: Store,
  input: { baseText: string; baseVersion: number; text: string },
): Promise<{ memo: ShoppingMemo; merged: boolean }> {
  let merged = false;
  const memo = await saveWithRetry(store, (latest) => {
    if (latest.version === input.baseVersion) return latest.withText(input.text);
    merged = true;
    return latest.withText(mergeMemoText(input.baseText, latest.text, input.text));
  });
  return { memo, merged };
}

/** 期間内の献立の材料を、まだ反映していない品の分だけメモに反映する */
export async function reflectMenuIngredients(
  store: Store,
  range: { from: CalendarDate; to: CalendarDate },
): Promise<ShoppingMemo> {
  if (compareDates(range.from, range.to) > 0) throw new DomainError("期間の始まりと終わりが逆です");
  const dishes = await store.loadDishesBetween(range.from, range.to);
  const recipes = new Map<string, Recipe>();
  for (const dish of dishes) {
    if (!recipes.has(dish.recipeId)) recipes.set(dish.recipeId, await loadRecipeOrFail(store, dish.recipeId));
  }
  const toReflect: DishToReflect[] = dishes.map((d) => ({
    dishId: d.id,
    date: d.date,
    recipe: recipes.get(d.recipeId)!,
    servingsToCook: d.servingsToCook,
  }));
  return saveWithRetry(store, (latest) => latest.reflect(toReflect, range));
}
