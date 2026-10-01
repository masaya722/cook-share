import { createClient } from "./supabase/client";
import type { MealPlan } from "./types";

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
  return (data ?? []) as unknown as MealPlan[];
}
