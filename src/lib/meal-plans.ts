import { createClient } from "./supabase/client";
import type { MealPlan } from "./types";

// タブを行き来したときに前回の結果をすぐ出すための、端末内だけのキャッシュ
const cache = new Map<string, MealPlan[]>();
const cacheKey = (from: string, to: string) => `${from}:${to}`;

export function cachedMealPlans(from: string, to: string): MealPlan[] | null {
  return cache.get(cacheKey(from, to)) ?? null;
}

/** 献立を追加・削除したら呼ぶ。別の期間（買い物リストなど）のキャッシュも古くなるので全部消す */
export function invalidateMealPlans() {
  cache.clear();
}

export async function fetchMealPlans(from: string, to: string): Promise<MealPlan[]> {
  const { data, error } = await createClient()
    .from("meal_plans")
    .select("id, date, meal, recipe_id, recipes(id, title, image_url, ingredients)")
    .gte("date", from)
    .lte("date", to)
    .order("date")
    .order("created_at");
  if (error) throw error;
  // recipes は外部キーから 1 件に決まるが、型生成なしだと配列扱いになるのでキャストする
  const plans = (data ?? []) as unknown as MealPlan[];
  cache.set(cacheKey(from, to), plans);
  return plans;
}
