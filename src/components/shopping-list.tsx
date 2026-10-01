"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { addDays, formatShort } from "@/lib/date";
import { aggregateIngredients, ingredientKey } from "@/lib/shopping";
import { fetchMealPlans } from "@/lib/meal-plans";
import { MEAL_LABELS, type MealPlan } from "@/lib/types";
import { useToday } from "@/lib/use-today";
import { subtleButtonClass } from "./ui";

function readChecked(storageKey: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(storageKey) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function ShoppingList({ from, to }: { from: string; to: string }) {
  // チェック状態は端末に保存しているので、サーバーでは描画せず端末側だけで描く
  const t = useToday();
  if (!t) return null;
  return <ShoppingListBody key={`${from}:${to}`} from={from} to={to} today={t} />;
}

function ShoppingListBody({ from, to, today: t }: { from: string; to: string; today: string }) {
  const router = useRouter();
  const [plans, setPlans] = useState<MealPlan[] | null>(null);
  const storageKey = `shopping-checked:${from}:${to}`;
  const [checked, setChecked] = useState<Set<string>>(() => readChecked(storageKey));
  const [loadError, setLoadError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMealPlans(from, to)
      .then((plans) => {
        if (!cancelled) setPlans(plans);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const items = useMemo(
    () =>
      aggregateIngredients(
        (plans ?? [])
          .filter((p) => p.recipes)
          .map((p) => ({ recipeTitle: p.recipes!.title, ingredients: p.recipes!.ingredients })),
      ),
    [plans],
  );

  function toggle(name: string) {
    const key = ingredientKey(name);
    const next = new Set(checked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChecked(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // プライベートブラウズ等で保存できなくても画面上のチェックは効く
    }
  }

  async function copyAsText() {
    const text = items
      .filter((i) => !checked.has(ingredientKey(i.name)))
      .map((i) => `・${i.name}${i.amount ? ` ${i.amount}` : ""}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const presets = [
    { label: "今日", from: t, to: t },
    { label: "明日", from: addDays(t, 1), to: addDays(t, 1) },
    { label: "3日分", from: t, to: addDays(t, 2) },
    { label: "1週間", from: t, to: addDays(t, 6) },
  ];

  const sorted = [...items].sort(
    (a, b) => Number(checked.has(ingredientKey(a.name))) - Number(checked.has(ingredientKey(b.name))),
  );

  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <button
              key={p.label}
              onClick={() => router.replace(`/shopping?from=${p.from}&to=${p.to}`)}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${
                active ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-sm text-muted">
        {from === to ? formatShort(from) : `${formatShort(from)} 〜 ${formatShort(to)}`} の献立
      </p>

      {plans === null ? (
        <p className="mt-10 text-center text-muted">
          {loadError ? "読み込めませんでした。通信状況を確認して開き直してください" : "読み込み中…"}
        </p>
      ) : plans.length === 0 ? (
        <p className="mt-10 text-center text-muted">この期間の献立はまだありません</p>
      ) : (
        <>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {plans.map((p) => (
              <li key={p.id} className="rounded-full bg-accent-soft px-3 py-1 text-xs">
                {formatShort(p.date)} {MEAL_LABELS[p.meal]}：{p.recipes?.title}
              </li>
            ))}
          </ul>

          <div className="mt-5 mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              材料 <span className="text-sm font-normal text-muted">{items.length}品</span>
            </h2>
            <button className={subtleButtonClass} onClick={copyAsText}>
              {copied ? "コピーしました ✓" : "テキストでコピー"}
            </button>
          </div>

          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {sorted.map((item) => {
              const done = checked.has(ingredientKey(item.name));
              return (
                <li key={item.name}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggle(item.name)}
                      className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                    />
                    <span className={`min-w-0 flex-1 ${done ? "text-muted line-through" : ""}`}>
                      <span className="flex justify-between gap-3">
                        <span className="font-medium">{item.name}</span>
                        <span className="shrink-0">{item.amount}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">{item.recipes.join("・")}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
