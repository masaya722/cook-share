import { MEAL_TIMES, type MealTime } from "@/domain/menu/meal";
import { addDays, type CalendarDate, compareDates } from "@/domain/shared/calendar-date";
import { createClient } from "./supabase/client";

/** 献立画面に出すための形（読み込み専用）。変更は Server Actions からドメイン層を通して行う */
export type RecipeCard = { id: string; title: string; image_url: string | null };

export type DishView = {
  id: string;
  recipe_id: string;
  servings_to_cook: number;
  created_at: string;
  recipe: RecipeCard | null;
};

export type LeftoverView = {
  source_dish_id: string;
  created_at: string;
  source: { id: string; recipe: RecipeCard | null } | null;
};

export type MealView = {
  id: string;
  date: CalendarDate;
  meal_time: MealTime;
  eating_out: boolean;
  dishes: DishView[];
  leftovers: LeftoverView[];
};

/** 残り物の候補: 前の食事で多めに作った品 */
export type LeftoverCandidate = {
  dish_id: string;
  servings_to_cook: number;
  date: CalendarDate;
  meal_time: MealTime;
  recipe: RecipeCard | null;
};

// meals と dishes は 2 通りでつながるので、使う外部キーを明示する。
// leftovers 側はつながり方が 1 通りなので指定しない（「!leftovers_...」は PostgREST が「!left」結合と読んでしまう）
const MEAL_SELECT = `
  id, date, meal_time, eating_out,
  dishes!dishes_meal_id_fkey(id, recipe_id, servings_to_cook, created_at, recipe:recipes(id, title, image_url)),
  leftovers(source_dish_id, created_at,
    source:dishes(id, recipe:recipes(id, title, image_url)))
`;

// タブを行き来したときに前回の結果をすぐ出すための、端末内だけのキャッシュ
const cache = new Map<string, MealView[]>();
const cacheKey = (from: string, to: string) => `${from}:${to}`;

export function cachedMeals(from: CalendarDate, to: CalendarDate): MealView[] | null {
  return cache.get(cacheKey(from, to)) ?? null;
}

/** 献立を変えたら呼ぶ */
export function invalidateMeals() {
  cache.clear();
}

const byCreatedAt = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at);

export async function fetchMeals(from: CalendarDate, to: CalendarDate): Promise<MealView[]> {
  const { data, error } = await createClient()
    .from("meals")
    .select(MEAL_SELECT)
    .gte("date", from)
    .lte("date", to)
    .order("date");
  if (error) throw error;
  const meals = (data as unknown as MealView[]).map((m) => ({
    ...m,
    dishes: [...m.dishes].sort(byCreatedAt),
    leftovers: [...m.leftovers].sort(byCreatedAt),
  }));
  cache.set(cacheKey(from, to), meals);
  return meals;
}

/** この食事より前の数日間に、多めに（2 人より多く）作った品 */
export async function fetchLeftoverCandidates(date: CalendarDate, mealTime: MealTime): Promise<LeftoverCandidate[]> {
  const { data, error } = await createClient()
    .from("dishes")
    .select("id, servings_to_cook, recipe:recipes(id, title, image_url), meal:meals!dishes_meal_id_fkey!inner(date, meal_time)")
    .gt("servings_to_cook", 2)
    .gte("meal.date", addDays(date, -3))
    .lte("meal.date", date);
  if (error) throw error;
  const rows = data as unknown as {
    id: string;
    servings_to_cook: number;
    recipe: RecipeCard | null;
    meal: { date: CalendarDate; meal_time: MealTime };
  }[];
  return rows
    .map((r) => ({
      dish_id: r.id,
      servings_to_cook: r.servings_to_cook,
      date: r.meal.date,
      meal_time: r.meal.meal_time,
      recipe: r.recipe,
    }))
    .filter((c) => {
      const byDate = compareDates(c.date, date);
      return byDate < 0 || (byDate === 0 && MEAL_TIMES.indexOf(c.meal_time) < MEAL_TIMES.indexOf(mealTime));
    })
    .sort((a, b) => compareDates(b.date, a.date));
}
