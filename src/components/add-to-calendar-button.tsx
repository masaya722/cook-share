"use client";

import { useState } from "react";
import { planDishAction } from "@/app/actions";
import { today } from "@/lib/date";
import { invalidateMealPlans } from "@/lib/meal-plans";
import { MEAL_LABELS, type Meal } from "@/lib/types";
import { Spinner, buttonClass, inputClass, subtleButtonClass } from "./ui";

export function AddToCalendarButton({ recipeId }: { recipeId: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [meal, setMeal] = useState<Meal>("dinner");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function save() {
    setStatus("saving");
    // 献立に入れると、材料が自動で買い物リストに入る
    const result = await planDishAction({ date, mealTime: meal, recipeId });
    if (result.ok) invalidateMealPlans();
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
          {(Object.keys(MEAL_LABELS) as Meal[]).map((m) => (
            <button
              key={m}
              onClick={() => setMeal(m)}
              className={`pressable flex-1 rounded-full border py-2 ${meal === m ? "border-accent bg-accent-soft font-semibold" : "border-border"}`}
            >
              {MEAL_LABELS[m]}
            </button>
          ))}
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
