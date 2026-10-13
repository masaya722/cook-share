"use server";

import { refresh } from "next/cache";
import * as useCases from "@/application/use-cases";
import type { MealTime } from "@/domain/menu/meal";
import { calendarDate } from "@/domain/shared/calendar-date";
import { DomainError } from "@/domain/shared/domain-error";
import { type ShoppingItemRow, toShoppingItemRow } from "@/infrastructure/shopping-item-mapper";
import { recipeFromDraft } from "@/infrastructure/recipe-mapper";
import { SupabaseStore } from "@/infrastructure/supabase-store";
import type { RecipeDraft } from "@/lib/types";
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

/** レシピを保存する。画面の入力はドメインのレシピに変換する時点でルールを確かめる */
export async function saveRecipeAction(input: { id?: string; draft: RecipeDraft }): Promise<ActionResult<string>> {
  const result = await run(async (store) => {
    const id = input.id ?? newId();
    await useCases.saveRecipe(store, recipeFromDraft(id, input.draft), input.id ? "update" : "insert");
    return id;
  });
  if (result.ok) refresh();
  return result;
}

export async function deleteRecipeAction(recipeId: string) {
  const result = await run((store) => useCases.deleteRecipe(store, recipeId));
  if (result.ok) refresh();
  return result;
}

export async function openShoppingListAction(today: string): Promise<ActionResult<ShoppingItemRow[]>> {
  return run(async (store) => (await useCases.openShoppingList(store, calendarDate(today))).map(toShoppingItemRow));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * メモ帳のように書き足す（1 行でも、何行まとめてでも）。afterId の行のすぐ下に入れる。
 * 画面が先に同じ操作をして表示しているので、新しい物の id は画面が決めた newIds を使う。
 */
export async function writeShoppingAction(input: {
  text: string;
  afterId?: string | null;
  newIds?: string[];
}): Promise<ActionResult<ShoppingItemRow[]>> {
  const newIds = (input.newIds ?? []).filter((id) => UUID.test(id)).slice(0, 500);
  const afterId = input.afterId && UUID.test(input.afterId) ? input.afterId : null;
  return run(async (store) =>
    (await useCases.writeShopping(store, input.text, { afterId, newIds })).map(toShoppingItemRow),
  );
}

export async function addShoppingDividerAction(): Promise<ActionResult<ShoppingItemRow>> {
  return run(async (store) => toShoppingItemRow(await useCases.addShoppingDivider(store)));
}

export async function editShoppingItemAction(id: string, text: string) {
  return run((store) => useCases.editShoppingItem(store, id, text));
}

export async function moveShoppingEntriesAction(ids: string[], beforeId: string | null) {
  return run((store) => useCases.moveShoppingEntries(store, ids, beforeId));
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
