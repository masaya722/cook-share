"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addDays, formatShort, weekdayIndex } from "@/lib/date";
import { cachedMealPlans, fetchMealPlans, invalidateMealPlans } from "@/lib/meal-plans";
import { createClient } from "@/lib/supabase/client";
import { MEAL_LABELS, type Meal, type MealPlan } from "@/lib/types";
import { useToday } from "@/lib/use-today";
import { RecipePicker, type PickerRecipe } from "./recipe-picker";
import { RecipeThumb } from "./recipe-thumb";
import { CalendarSkeleton } from "./skeletons";
import { Skeleton, Spinner, subtleButtonClass } from "./ui";

const MEAL_ORDER: Meal[] = ["breakfast", "lunch", "dinner"];

/** 月曜始まりの週の初日 */
function weekStart(key: string): string {
  return addDays(key, -((weekdayIndex(key) + 6) % 7));
}

export function MealCalendar() {
  const todayKey = useToday();
  return todayKey ? <WeekView todayKey={todayKey} /> : <CalendarSkeleton />;
}

function WeekView({ todayKey }: { todayKey: string }) {
  const [start, setStart] = useState(() => weekStart(todayKey));
  // 表示中の週と取得結果を組で持ち、週を切り替えた直後は古い週の献立を出さない
  const [loaded, setLoaded] = useState<{ start: string; plans: MealPlan[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [picking, setPicking] = useState<{ date: string; meal: Meal } | null>(null);
  const end = addDays(start, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  // 取得が終わるまでは、前に同じ週を開いたときの結果を出しておく
  const plans = loaded?.start === start ? loaded.plans : cachedMealPlans(start, end);

  useEffect(() => {
    let cancelled = false;
    fetchMealPlans(start, end)
      .then((plans) => {
        if (!cancelled) setLoaded({ start, plans });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  async function add(recipe: PickerRecipe) {
    if (!picking) return;
    const target = picking;
    setPicking(null);
    setActionError(null);
    // 保存の完了を待たずに画面へ出す（id が temp- のものは保存中として薄く表示する）
    const temp: MealPlan = {
      id: `temp-${Date.now()}`,
      date: target.date,
      meal: target.meal,
      recipe_id: recipe.id,
      recipes: { id: recipe.id, title: recipe.title, image_url: recipe.image_url, ingredients: [], servings: null },
    };
    setLoaded({ start, plans: [...(plans ?? []), temp] });

    const { error } = await createClient()
      .from("meal_plans")
      .insert({ date: target.date, meal: target.meal, recipe_id: recipe.id });
    invalidateMealPlans();
    if (error) setActionError("献立を追加できませんでした。もう一度試してください");
    try {
      setLoaded({ start, plans: await fetchMealPlans(start, end) });
    } catch {
      setLoaded((l) => l && { ...l, plans: l.plans.filter((p) => p.id !== temp.id) });
    }
  }

  async function remove(id: string) {
    setActionError(null);
    setLoaded((l) => l && { ...l, plans: l.plans.filter((x) => x.id !== id) });
    const { error } = await createClient().from("meal_plans").delete().eq("id", id);
    invalidateMealPlans();
    if (error) {
      setActionError("献立から外せませんでした。もう一度試してください");
      setLoaded({ start, plans: await fetchMealPlans(start, end) });
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <button className={subtleButtonClass} onClick={() => setStart(addDays(start, -7))} aria-label="前の週">
          ‹ 前週
        </button>
        <button className="pressable text-sm font-semibold" onClick={() => setStart(weekStart(todayKey))}>
          {formatShort(start)} 〜 {formatShort(end)}
        </button>
        <button className={subtleButtonClass} onClick={() => setStart(addDays(start, 7))} aria-label="次の週">
          次週 ›
        </button>
      </div>

      {actionError && <p className="mb-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">{actionError}</p>}
      {loadError && (
        <p className="mb-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">
          献立を読み込めませんでした。通信状況を確認して開き直してください
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {days.map((day) => {
          const dayPlans = plans?.filter((p) => p.date === day) ?? [];
          const isToday = day === todayKey;
          const dow = weekdayIndex(day);
          return (
            <li
              key={day}
              className={`rounded-2xl border bg-surface p-3 ${isToday ? "border-accent" : "border-border"}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm font-bold ${dow === 0 ? "text-red-500" : dow === 6 ? "text-sky-600" : ""}`}
                >
                  {formatShort(day)}
                  {isToday && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">今日</span>}
                </span>
                <div className="flex gap-1">
                  {MEAL_ORDER.map((meal) => (
                    <button
                      key={meal}
                      onClick={() => setPicking({ date: day, meal })}
                      className="pressable rounded-full border border-border px-2.5 py-1 text-xs text-muted"
                    >
                      ＋{MEAL_LABELS[meal]}
                    </button>
                  ))}
                </div>
              </div>
              {plans === null && <Skeleton className="mt-2 h-9" />}
              {dayPlans.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {MEAL_ORDER.flatMap((meal) =>
                    dayPlans
                      .filter((p) => p.meal === meal)
                      .map((p) => (
                        <li key={p.id} className={`flex items-center gap-2 ${p.id.startsWith("temp-") ? "opacity-50" : ""}`}>
                          <span className="w-5 shrink-0 text-center text-xs text-muted">{MEAL_LABELS[meal]}</span>
                          <Link href={`/recipes/${p.recipe_id}`} className="pressable flex min-w-0 flex-1 items-center gap-2">
                            <RecipeThumb src={p.recipes?.image_url ?? null} className="h-9 w-12 shrink-0 rounded-md" />
                            <span className="truncate text-sm">{p.recipes?.title ?? "（削除されたレシピ）"}</span>
                          </Link>
                          {p.id.startsWith("temp-") ? (
                            <span className="px-2 text-muted">
                              <Spinner />
                            </span>
                          ) : (
                            <button onClick={() => remove(p.id)} aria-label="献立から外す" className="pressable px-2 text-lg text-muted">
                              ×
                            </button>
                          )}
                        </li>
                      )),
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <Link
        href={`/shopping?from=${start}&to=${end}`}
        className={`${subtleButtonClass} mt-4 w-full py-3`}
      >
        この週の買い物リストを見る
      </Link>

      {picking && (
        <RecipePicker
          title={`${formatShort(picking.date)} ${MEAL_LABELS[picking.meal]}ごはん`}
          onPick={add}
          onClose={() => setPicking(null)}
        />
      )}
    </>
  );
}
