"use client";

import { useState } from "react";
import { planDishAction } from "@/app/actions";
import { today } from "@/lib/date";
import { MEAL_TIME_LABELS, MEAL_TIMES, type MealTime } from "@/domain/menu/meal";
import { HOUSEHOLD_SERVINGS } from "@/domain/recipe/servings";
import { invalidateMeals } from "@/lib/meals";
import { ServingsStepper } from "./servings-stepper";
import { Spinner, buttonClass, inputClass, subtleButtonClass } from "./ui";

export function AddToCalendarButton({ recipeId }: { recipeId: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [meal, setMeal] = useState<MealTime>("dinner");
  const [servings, setServings] = useState(HOUSEHOLD_SERVINGS);
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function save() {
    setStatus("saving");
    // 献立に入れると、材料が自動で買い物リストに入る
    const result = await planDishAction({ date, mealTime: meal, recipeId, servingsToCook: servings });
    if (result.ok) invalidateMeals();
    else setError(result.error);
    setStatus(result.ok ? "done" : "error");
    if (result.ok) setTimeout(() => setOpen(false), 800);
  }

  if (!open) {
    return (
      <button
        className={buttonClass}
        onClick={() => {
          setStatus("idle");
          if (!date) setDate(today());
          setOpen(true);
        }}
      >
        献立に追加
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={() => setOpen(false)}>
      <div
        className="w-full rounded-t-3xl bg-surface p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold">いつ作りますか？</h2>
        <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        <div className="mt-3 flex gap-2">
          {MEAL_TIMES.map((m) => (
            <button
              key={m}
              onClick={() => setMeal(m)}
              className={`pressable flex-1 rounded-full border py-2 ${meal === m ? "border-accent bg-accent-soft font-semibold" : "border-border"}`}
            >
              {MEAL_TIME_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-background px-4 py-2">
          <span className="text-sm text-muted">作る人数（翌日も食べるなら多めに）</span>
          <ServingsStepper value={servings} onChange={setServings} />
        </div>
        {status === "error" && <p className="mt-3 text-sm text-accent">{error}</p>}
        <div className="mt-5 flex gap-2">
          <button className={`${subtleButtonClass} flex-1`} onClick={() => setOpen(false)}>
            閉じる
          </button>
          <button
            className={`${buttonClass} flex-1`}
            onClick={save}
            disabled={!date || status === "saving" || status === "done"}
          >
            {status === "saving" && <Spinner />}
            {status === "done" ? "追加しました ✓" : status === "saving" ? "追加中…" : "追加"}
          </button>
        </div>
      </div>
    </div>
  );
}
