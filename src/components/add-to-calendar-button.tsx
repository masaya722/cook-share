"use client";

import { useState } from "react";
import { today } from "@/lib/date";
import { createClient } from "@/lib/supabase/client";
import { MEAL_LABELS, type Meal } from "@/lib/types";
import { buttonClass, inputClass, subtleButtonClass } from "./ui";

export function AddToCalendarButton({ recipeId }: { recipeId: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [meal, setMeal] = useState<Meal>("dinner");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function save() {
    setStatus("saving");
    const { error } = await createClient().from("meal_plans").insert({ date, meal, recipe_id: recipeId });
    setStatus(error ? "error" : "done");
    if (!error) setTimeout(() => setOpen(false), 800);
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
              className={`flex-1 rounded-full border py-2 ${meal === m ? "border-accent bg-accent-soft font-semibold" : "border-border"}`}
            >
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
        {status === "error" && <p className="mt-3 text-sm text-accent">保存できませんでした</p>}
        <div className="mt-5 flex gap-2">
          <button className={`${subtleButtonClass} flex-1`} onClick={() => setOpen(false)}>
            閉じる
          </button>
          <button
            className={`${buttonClass} flex-1`}
            onClick={save}
            disabled={!date || status === "saving" || status === "done"}
          >
            {status === "done" ? "追加しました ✓" : "追加"}
          </button>
        </div>
      </div>
    </div>
  );
}
