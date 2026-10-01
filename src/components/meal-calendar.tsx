"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addDays, formatShort, weekdayIndex } from "@/lib/date";
import { fetchMealPlans } from "@/lib/meal-plans";
import { createClient } from "@/lib/supabase/client";
import { MEAL_LABELS, type Meal, type MealPlan } from "@/lib/types";
import { useToday } from "@/lib/use-today";
import { RecipePicker } from "./recipe-picker";
import { RecipeThumb } from "./recipe-thumb";
import { subtleButtonClass } from "./ui";

const MEAL_ORDER: Meal[] = ["breakfast", "lunch", "dinner"];

/** 月曜始まりの週の初日 */
function weekStart(key: string): string {
  return addDays(key, -((weekdayIndex(key) + 6) % 7));
}

export function MealCalendar() {
  const todayKey = useToday();
  return todayKey ? <WeekView todayKey={todayKey} /> : null;
}

function WeekView({ todayKey }: { todayKey: string }) {
  const [start, setStart] = useState(() => weekStart(todayKey));
  // 表示中の週と取得結果を組で持ち、週を切り替えた直後は古い週の献立を出さない
  const [loaded, setLoaded] = useState<{ start: string; plans: MealPlan[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [picking, setPicking] = useState<{ date: string; meal: Meal } | null>(null);
  const end = addDays(start, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const plans = loaded?.start === start ? loaded.plans : null;

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

  async function add(recipeId: string) {
    if (!picking) return;
    const target = picking;
    setPicking(null);
    await createClient().from("meal_plans").insert({ date: target.date, meal: target.meal, recipe_id: recipeId });
    setLoaded({ start, plans: await fetchMealPlans(start, end) });
  }

  async function remove(id: string) {
    setLoaded((l) => l && { ...l, plans: l.plans.filter((x) => x.id !== id) });
    await createClient().from("meal_plans").delete().eq("id", id);
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <button className={subtleButtonClass} onClick={() => setStart(addDays(start, -7))} aria-label="前の週">
          ‹ 前週
        </button>
        <button className="text-sm font-semibold" onClick={() => setStart(weekStart(todayKey))}>
          {formatShort(start)} 〜 {formatShort(end)}
        </button>
        <button className={subtleButtonClass} onClick={() => setStart(addDays(start, 7))} aria-label="次の週">
          次週 ›
        </button>
      </div>

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
                      className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted"
                    >
                      ＋{MEAL_LABELS[meal]}
                    </button>
                  ))}
                </div>
              </div>
              {dayPlans.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {MEAL_ORDER.flatMap((meal) =>
                    dayPlans
                      .filter((p) => p.meal === meal)
                      .map((p) => (
                        <li key={p.id} className="flex items-center gap-2">
                          <span className="w-5 shrink-0 text-center text-xs text-muted">{MEAL_LABELS[meal]}</span>
                          <Link href={`/recipes/${p.recipe_id}`} className="flex min-w-0 flex-1 items-center gap-2">
                            <RecipeThumb src={p.recipes?.image_url ?? null} className="h-9 w-12 shrink-0 rounded-md" />
                            <span className="truncate text-sm">{p.recipes?.title ?? "（削除されたレシピ）"}</span>
                          </Link>
                          <button onClick={() => remove(p.id)} aria-label="献立から外す" className="px-2 text-lg text-muted">
                            ×
                          </button>
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
