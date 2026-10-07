"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  type ActionResult,
  addLeftoverAction,
  cancelEatingOutAction,
  changeServingsAction,
  markEatingOutAction,
  planDishAction,
  removeDishAction,
  removeLeftoverAction,
} from "@/app/actions";
import { MEAL_TIME_LABELS, MEAL_TIMES, type MealTime } from "@/domain/menu/meal";
import { addDays, type CalendarDate, weekday } from "@/domain/shared/calendar-date";
import { formatShort } from "@/lib/date";
import { cachedMeals, fetchMeals, invalidateMeals, type MealView } from "@/lib/meals";
import { useToday } from "@/lib/use-today";
import { MealSheet } from "./meal-sheet";
import { RecipeThumb } from "./recipe-thumb";
import { ServingsStepper } from "./servings-stepper";
import { CalendarSkeleton } from "./skeletons";
import { Skeleton, Spinner, subtleButtonClass } from "./ui";

/** 月曜始まりの週の初日 */
function weekStart(day: CalendarDate): CalendarDate {
  return addDays(day, -((weekday(day) + 6) % 7));
}

type Slot = { date: CalendarDate; mealTime: MealTime };

/** 保存中の表示（保存が終わるまで薄く出しておく品） */
type Pending = Slot & { key: string; title: string; image_url: string | null; leftover: boolean };

export function MealCalendar() {
  const todayKey = useToday() as CalendarDate | null;
  return todayKey ? <WeekView todayKey={todayKey} /> : <CalendarSkeleton />;
}

function WeekView({ todayKey }: { todayKey: CalendarDate }) {
  const [start, setStart] = useState(() => weekStart(todayKey));
  // 表示中の週と取得結果を組で持ち、週を切り替えた直後は古い週の献立を出さない
  const [loaded, setLoaded] = useState<{ start: CalendarDate; meals: MealView[] } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<(Slot & { eatingOut: boolean }) | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const end = addDays(start, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  // 取得が終わるまでは、前に同じ週を開いたときの結果を出しておく
  const meals = loaded?.start === start ? loaded.meals : cachedMeals(start, end);

  useEffect(() => {
    let cancelled = false;
    fetchMeals(start, end)
      .then((meals) => {
        if (!cancelled) setLoaded({ start, meals });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  /** 献立を変える操作の共通の流れ: 保存中の表示 → Server Action → 読み直し */
  async function act(key: string, action: () => Promise<ActionResult<unknown>>) {
    setActionError(null);
    setBusy((b) => new Set(b).add(key));
    const result = await action().catch(
      () => ({ ok: false, error: "保存できませんでした。通信状況を確認してください" }) as const,
    );
    invalidateMeals();
    if (!result.ok) setActionError(result.error);
    try {
      setLoaded({ start, meals: await fetchMeals(start, end) });
    } catch {
      setLoadError(true);
    }
    setBusy((b) => {
      const next = new Set(b);
      next.delete(key);
      return next;
    });
    setPending((p) => p.filter((x) => x.key !== key));
  }

  function addPending(p: Pending) {
    setSheet(null);
    setPending((list) => [...list, p]);
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
          const isToday = day === todayKey;
          const dow = weekday(day);
          return (
            <li
              key={day}
              className={`rounded-2xl border bg-surface p-3 ${isToday ? "border-accent" : "border-border"}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-bold ${dow === 0 ? "text-red-500" : dow === 6 ? "text-sky-600" : ""}`}>
                  {formatShort(day)}
                  {isToday && (
                    <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">今日</span>
                  )}
                </span>
                <div className="flex gap-1">
                  {MEAL_TIMES.map((mealTime) => {
                    const meal = meals?.find((m) => m.date === day && m.meal_time === mealTime);
                    return (
                      <button
                        key={mealTime}
                        onClick={() => setSheet({ date: day, mealTime, eatingOut: meal?.eating_out ?? false })}
                        className="pressable rounded-full border border-border px-2.5 py-1 text-xs text-muted"
                      >
                        ＋{MEAL_TIME_LABELS[mealTime]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {meals === null ? (
                <Skeleton className="mt-2 h-9" />
              ) : (
                <ul className="mt-1 flex flex-col">
                  {MEAL_TIMES.map((mealTime) => {
                    const meal = meals.find((m) => m.date === day && m.meal_time === mealTime);
                    const waiting = pending.filter((p) => p.date === day && p.mealTime === mealTime);
                    if (!meal && waiting.length === 0) return null;
                    const slot = { date: day, mealTime };
                    return (
                      <MealRows
                        key={mealTime}
                        slot={slot}
                        meal={meal}
                        waiting={waiting}
                        busy={busy}
                        onServings={(dishId, n) => act(`dish:${dishId}`, () => changeServingsAction(dishId, n))}
                        onRemoveDish={(dishId) => act(`dish:${dishId}`, () => removeDishAction(dishId))}
                        onRemoveLeftover={(sourceDishId) =>
                          act(`leftover:${day}:${mealTime}:${sourceDishId}`, () =>
                            removeLeftoverAction({ ...slot, sourceDishId }),
                          )
                        }
                        onCancelEatingOut={() => act(`eatingout:${day}:${mealTime}`, () => cancelEatingOutAction(slot))}
                      />
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <Link href="/shopping" className={`${subtleButtonClass} mt-4 w-full py-3`}>
        買い物リストを見る
      </Link>

      {sheet && (
        <MealSheet
          date={sheet.date}
          mealTime={sheet.mealTime}
          eatingOut={sheet.eatingOut}
          onClose={() => setSheet(null)}
          onPickRecipe={(recipe, servingsToCook) => {
            const key = `add:${crypto.randomUUID()}`;
            addPending({ ...sheet, key, title: recipe.title, image_url: recipe.image_url, leftover: false });
            // 献立に入れると、材料が作る人数に合わせて自動で買い物リストに入る
            void act(key, () => planDishAction({ ...sheet, recipeId: recipe.id, servingsToCook }));
          }}
          onPickLeftover={(c) => {
            const key = `add:${crypto.randomUUID()}`;
            addPending({ ...sheet, key, title: c.recipe?.title ?? "", image_url: c.recipe?.image_url ?? null, leftover: true });
            void act(key, () => addLeftoverAction({ ...sheet, sourceDishId: c.dish_id }));
          }}
          onEatingOut={() => {
            const key = `eatingout:${sheet.date}:${sheet.mealTime}`;
            setSheet(null);
            void act(key, () => markEatingOutAction(sheet));
          }}
        />
      )}
    </>
  );
}

function MealRows({
  slot,
  meal,
  waiting,
  busy,
  onServings,
  onRemoveDish,
  onRemoveLeftover,
  onCancelEatingOut,
}: {
  slot: Slot;
  meal: MealView | undefined;
  waiting: Pending[];
  busy: Set<string>;
  onServings: (dishId: string, n: number) => void;
  onRemoveDish: (dishId: string) => void;
  onRemoveLeftover: (sourceDishId: string) => void;
  onCancelEatingOut: () => void;
}) {
  const label = <span className="w-5 shrink-0 text-center text-xs text-muted">{MEAL_TIME_LABELS[slot.mealTime]}</span>;
  const removeButton = (onClick: () => void, disabled: boolean, name: string) =>
    disabled ? (
      <span className="px-2 text-muted">
        <Spinner />
      </span>
    ) : (
      <button onClick={onClick} aria-label={`${name}を献立から外す`} className="pressable px-2 text-lg text-muted">
        ×
      </button>
    );

  return (
    <>
      {meal?.eating_out && (
        <li className="flex items-center gap-2 py-1">
          {label}
          <span className="flex-1 text-sm">🍴 外食</span>
          {busy.has(`eatingout:${slot.date}:${slot.mealTime}`) ? (
            <Spinner />
          ) : (
            <button onClick={onCancelEatingOut} className="pressable px-2 text-xs text-muted">
              やめる
            </button>
          )}
        </li>
      )}

      {meal?.dishes.map((d) => {
        const isBusy = busy.has(`dish:${d.id}`);
        return (
          <li key={d.id} className={`flex items-center gap-2 py-1 ${isBusy ? "opacity-60" : ""}`}>
            {label}
            <Link href={`/recipes/${d.recipe_id}`} className="pressable flex min-w-0 flex-1 items-center gap-2">
              <RecipeThumb src={d.recipe?.image_url ?? null} className="h-9 w-12 shrink-0 rounded-md" />
              <span className="truncate text-sm">{d.recipe?.title}</span>
            </Link>
            <ServingsStepper value={d.servings_to_cook} onChange={(n) => onServings(d.id, n)} disabled={isBusy} />
            {removeButton(() => onRemoveDish(d.id), isBusy, d.recipe?.title ?? "品")}
          </li>
        );
      })}

      {meal?.leftovers.map((l) => {
        const isBusy = busy.has(`leftover:${slot.date}:${slot.mealTime}:${l.source_dish_id}`);
        return (
          <li key={l.source_dish_id} className={`flex items-center gap-2 py-1 ${isBusy ? "opacity-60" : ""}`}>
            {label}
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <RecipeThumb src={l.source?.recipe?.image_url ?? null} className="h-9 w-12 shrink-0 rounded-md opacity-70" />
              <span className="truncate text-sm">
                {l.source?.recipe?.title}
                <span className="ml-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px]">残り物</span>
              </span>
            </span>
            {removeButton(() => onRemoveLeftover(l.source_dish_id), isBusy, "残り物")}
          </li>
        );
      })}

      {waiting.map((p) => (
        <li key={p.key} className="flex items-center gap-2 py-1 opacity-50">
          {label}
          <RecipeThumb src={p.image_url} className="h-9 w-12 shrink-0 rounded-md" />
          <span className="flex-1 truncate text-sm">
            {p.title}
            {p.leftover && <span className="ml-1 rounded bg-accent-soft px-1.5 py-0.5 text-[10px]">残り物</span>}
          </span>
          <span className="px-2 text-muted">
            <Spinner />
          </span>
        </li>
      ))}
    </>
  );
}
