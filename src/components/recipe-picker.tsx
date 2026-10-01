"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Recipe } from "@/lib/types";
import { RecipeThumb } from "./recipe-thumb";
import { Skeleton, inputClass } from "./ui";

export type PickerRecipe = Pick<Recipe, "id" | "title" | "image_url" | "tags">;

// 2 回目以降は前回の一覧をすぐ出し、裏で最新にする
let recipeCache: PickerRecipe[] | null = null;

export function RecipePicker({
  title,
  onPick,
  onClose,
}: {
  title: string;
  onPick: (recipe: PickerRecipe) => void;
  onClose: () => void;
}) {
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
    <div className="fixed inset-0 z-30 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[85dvh] w-full flex-col rounded-t-3xl bg-surface pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="pressable text-muted">
            閉じる
          </button>
        </div>
        <div className="px-5">
          <input
            type="search"
            placeholder="レシピを検索"
            className={inputClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className="mt-3 flex-1 overflow-y-auto px-5 pb-5">
          {filtered === null &&
            Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-border py-2">
                <Skeleton className="h-12 w-16 shrink-0 rounded-lg" />
                <Skeleton className="h-4 flex-1" />
              </li>
            ))}
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
      </div>
    </div>
  );
}
