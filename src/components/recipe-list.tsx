"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { RecipeSummary } from "@/lib/types";
import { RecipeThumb } from "./recipe-thumb";
import { inputClass } from "./ui";

export function RecipeList({ recipes }: { recipes: RecipeSummary[] }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    recipes.forEach((r) => r.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [recipes]);

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return recipes.filter((r) => {
      if (tag && !r.tags.includes(tag)) return false;
      // タイトル・タグ・材料名のどれかに全キーワードが含まれていればヒット
      const haystack = [r.title, ...r.tags, ...r.ingredients.map((i) => i.name)].join(" ").toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [recipes, query, tag]);

  if (recipes.length === 0) {
    return (
      <div className="mt-16 text-center text-muted">
        <p>まだレシピがありません</p>
        <p className="mt-1 text-sm">右上の「＋ 追加」から YouTube や Web サイトの URL を取り込めます</p>
      </div>
    );
  }

  return (
    <>
      <input
        type="search"
        placeholder="料理名・材料・タグで検索"
        className={inputClass}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {tags.length > 0 && (
        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={`shrink-0 rounded-full border px-3 py-1 text-sm ${
                tag === t ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <ul className="mt-4 grid grid-cols-2 gap-3">
        {filtered.map((r) => (
          <li key={r.id}>
            <Link href={`/recipes/${r.id}`} className="block overflow-hidden rounded-2xl border border-border bg-surface">
              <RecipeThumb src={r.image_url} sourceType={r.source_type} className="aspect-[4/3]" />
              <div className="p-2.5">
                <p className="line-clamp-2 text-sm font-semibold leading-snug">{r.title}</p>
                {r.cook_time && <p className="mt-1 text-xs text-muted">⏱ {r.cook_time}</p>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {filtered.length === 0 && <p className="mt-10 text-center text-muted">見つかりませんでした</p>}
    </>
  );
}
