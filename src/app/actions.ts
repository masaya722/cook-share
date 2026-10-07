"use server";

import { refresh } from "next/cache";
import * as useCases from "@/application/use-cases";
import type { MealTime } from "@/domain/menu/meal";
import { calendarDate } from "@/domain/shared/calendar-date";
import { DomainError } from "@/domain/shared/domain-error";
import { type ShoppingItemRow, toShoppingItemRow } from "@/infrastructure/shopping-item-mapper";
import { SupabaseStore } from "@/infrastructure/supabase-store";
import { createClient } from "@/lib/supabase/server";

/** 画面に返す結果。ドメインのルール違反はメッセージとして返し、それ以外は例外のまま */
export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

const MEAL_TIMES: MealTime[] = ["breakfast", "lunch", "dinner"];

/** Server Actions は URL を知っていれば直接呼べるので、毎回ログインを確かめる（家族かどうかは RLS が守る） */
async function storeForSignedInUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) throw new Error("ログインしてください");
  return new SupabaseStore(supabase);
}

async function run<T>(fn: (store: SupabaseStore) => Promise<T>): Promise<ActionResult<T>> {
  const store = await storeForSignedInUser();
  try {
    return { ok: true, value: await fn(store) };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "保存できませんでした。通信状況を確認してもう一度試してください" };
  }
}

function mealTime(value: string): MealTime {
  if (!MEAL_TIMES.includes(value as MealTime)) throw new DomainError("食事区分が正しくありません");
  return value as MealTime;
}

const newId = () => crypto.randomUUID();

type MealSlot = { date: string; mealTime: string };
const slot = (input: MealSlot) => ({ date: calendarDate(input.date), mealTime: mealTime(input.mealTime) });

export async function planDishAction(input: MealSlot & { recipeId: string; servingsToCook?: number }) {
  return run((store) =>
    useCases.planDish(store, { ...slot(input), recipeId: input.recipeId, servingsToCook: input.servingsToCook }, newId),
  );
}

export async function removeDishAction(dishId: string) {
  return run((store) => useCases.removeDish(store, dishId));
}

export async function changeServingsAction(dishId: string, servingsToCook: number) {
  return run((store) => useCases.changeServings(store, dishId, servingsToCook));
}

export async function markEatingOutAction(input: MealSlot) {
  return run((store) => useCases.markEatingOut(store, slot(input), newId));
}

export async function cancelEatingOutAction(input: MealSlot) {
  return run((store) => useCases.cancelEatingOut(store, slot(input)));
}

export async function addLeftoverAction(input: MealSlot & { sourceDishId: string }) {
  return run((store) => useCases.addLeftover(store, { ...slot(input), sourceDishId: input.sourceDishId }, newId));
}

export async function removeLeftoverAction(input: MealSlot & { sourceDishId: string }) {
  return run((store) => useCases.removeLeftover(store, { ...slot(input), sourceDishId: input.sourceDishId }));
}

export async function upcomingUsesOfRecipeAction(recipeId: string, today: string) {
  return run((store) => useCases.upcomingUsesOfRecipe(store, recipeId, calendarDate(today)));
}

export async function deleteRecipeAction(recipeId: string) {
  const result = await run((store) => useCases.deleteRecipe(store, recipeId));
  if (result.ok) refresh();
  return result;
}

export async function openShoppingListAction(today: string): Promise<ActionResult<ShoppingItemRow[]>> {
  return run(async (store) => (await useCases.openShoppingList(store, calendarDate(today))).map(toShoppingItemRow));
}

export async function addShoppingItemAction(input: { food: string; quantity?: string }) {
  return run(async (store) => toShoppingItemRow(await useCases.addShoppingItem(store, input)));
}

export async function markBoughtAction(ids: string[], today: string) {
  return run((store) => useCases.markBought(store, ids, calendarDate(today)));
}

export async function unmarkBoughtAction(ids: string[]) {
  return run((store) => useCases.unmarkBought(store, ids));
}

export async function removeShoppingItemsAction(ids: string[]) {
  return run((store) => useCases.removeShoppingItems(store, ids));
}
