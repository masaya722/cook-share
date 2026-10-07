"use client";

import { useEffect, useMemo, useState } from "react";
import { MEAL_TIME_LABELS, type MealTime } from "@/domain/menu/meal";
import { HOUSEHOLD_SERVINGS } from "@/domain/recipe/servings";
import type { CalendarDate } from "@/domain/shared/calendar-date";
import { formatShort } from "@/lib/date";
import { fetchLeftoverCandidates, type LeftoverCandidate, type RecipeCard } from "@/lib/meals";
import { createClient } from "@/lib/supabase/client";
import { RecipeThumb } from "./recipe-thumb";
import { ServingsStepper } from "./servings-stepper";
import { Skeleton, inputClass, subtleButtonClass } from "./ui";

type PickerRecipe = RecipeCard & { tags: string[] };

// 2 回目以降は前回の一覧をすぐ出し、裏で最新にする
let recipeCache: PickerRecipe[] | null = null;

/** 食事に何を入れるかを選ぶシート: レシピ / 残り物 / 外食 */
export function MealSheet({
  date,
  mealTime,
  eatingOut,
  onPickRecipe,
  onPickLeftover,
  onEatingOut,
  onClose,
}: {
  date: CalendarDate;
  mealTime: MealTime;
  eatingOut: boolean;
  onPickRecipe: (recipe: RecipeCard, servingsToCook: number) => void;
  onPickLeftover: (candidate: LeftoverCandidate) => void;
  onEatingOut: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"recipe" | "leftover">("recipe");
  const [servings, setServings] = useState(HOUSEHOLD_SERVINGS);

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[85dvh] w-full flex-col rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="text-lg font-bold">
            {formatShort(date)} {MEAL_TIME_LABELS[mealTime]}ごはん
          </h2>
          <button onClick={onClose} className="pressable text-muted">
            閉じる
          </button>
        </div>

        <div className="mx-5 flex rounded-full bg-background p-1 text-sm">
          {(
            [
              ["recipe", "レシピから"],
              ["leftover", "残り物から"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`pressable flex-1 rounded-full py-1.5 ${tab === key ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "recipe" ? (
          <>
            <div className="mx-5 mt-3 flex items-center justify-between rounded-xl bg-background px-4 py-2">
              <span className="text-sm text-muted">作る人数</span>
              <ServingsStepper value={servings} onChange={setServings} />
            </div>
            <RecipeList onPick={(r) => onPickRecipe(r, servings)} />
          </>
        ) : (
          <LeftoverList date={date} mealTime={mealTime} onPick={onPickLeftover} />
        )}

        {!eatingOut && (
          <div className="border-t border-border px-5 pt-3 pb-4">
            <button className={`${subtleButtonClass} w-full py-2.5`} onClick={onEatingOut}>
              🍴 この食事は外食にする
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RecipeList({ onPick }: { onPick: (recipe: RecipeCard) => void }) {
  const [recipes, setRecipes] = useState<PickerRecipe[] | null>(recipeCache);
  const [query, setQuery] = useState("");

  useEffect(() => {
    createClient()
      .from("recipes")
      .select("id, title, image_url, tags")
      .order("updated_at", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        recipeCache = data as PickerRecipe[];
        setRecipes(recipeCache);
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!recipes || !q) return recipes;
    return recipes.filter((r) => [r.title, ...r.tags].join(" ").toLowerCase().includes(q));
  }, [recipes, query]);

  return (
    <>
      <div className="px-5 pt-3">
        <input
          type="search"
          placeholder="レシピを検索"
          className={inputClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ul className="mt-2 min-h-40 flex-1 overflow-y-auto px-5 pb-3">
        {filtered === null && <ListSkeleton />}
        {filtered?.length === 0 && <li className="py-6 text-center text-muted">レシピがありません</li>}
        {filtered?.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => onPick(r)}
              className="pressable flex w-full items-center gap-3 border-b border-border py-2 text-left"
            >
              <RecipeThumb src={r.image_url} className="h-12 w-16 shrink-0 rounded-lg" />
              <span className="line-clamp-2 text-sm">{r.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function LeftoverList({
  date,
  mealTime,
  onPick,
}: {
  date: CalendarDate;
  mealTime: MealTime;
  onPick: (candidate: LeftoverCandidate) => void;
}) {
  const [candidates, setCandidates] = useState<LeftoverCandidate[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchLeftoverCandidates(date, mealTime)
      .then((c) => {
        if (!cancelled) setCandidates(c);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [date, mealTime]);

  return (
    <ul className="mt-3 min-h-40 flex-1 overflow-y-auto px-5 pb-3">
      {failed && <li className="py-6 text-center text-sm text-muted">読み込めませんでした</li>}
      {!failed && candidates === null && <ListSkeleton />}
      {candidates?.length === 0 && (
        <li className="py-6 text-center text-sm text-muted">
          ここ数日で多めに作った品はありません
          <br />
          作る人数を 3 人以上にした品が、ここに出ます
        </li>
      )}
      {candidates?.map((c) => (
        <li key={c.dish_id}>
          <button
            onClick={() => onPick(c)}
            className="pressable flex w-full items-center gap-3 border-b border-border py-2 text-left"
          >
            <RecipeThumb src={c.recipe?.image_url ?? null} className="h-12 w-16 shrink-0 rounded-lg" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 text-sm">{c.recipe?.title}</span>
              <span className="block text-xs text-muted">
                {formatShort(c.date)} {MEAL_TIME_LABELS[c.meal_time]}に{c.servings_to_cook}人分作った
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-border py-2">
          <Skeleton className="h-12 w-16 shrink-0 rounded-lg" />
          <Skeleton className="h-4 flex-1" />
        </li>
      ))}
    </>
  );
}
