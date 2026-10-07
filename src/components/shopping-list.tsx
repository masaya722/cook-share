"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, formatShort } from "@/lib/date";
import { shoppingRowsFromPlans } from "@/lib/shopping";
import { cachedMealPlans, fetchMealPlans } from "@/lib/meal-plans";
import { MEAL_LABELS, type MealPlan } from "@/lib/types";
import { useToday } from "@/lib/use-today";
import { ShoppingSkeleton } from "./skeletons";
import { Skeleton, subtleButtonClass } from "./ui";

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
  // 期間の切り替えはサーバーを通さず端末内で行う（URL だけ書き換えて、再読み込みしても同じ期間を開けるようにする）
  const [range, setRange] = useState({ from, to });
  if (!t) return <ShoppingSkeleton />;

  function selectRange(next: { from: string; to: string }) {
    setRange(next);
    window.history.replaceState(null, "", `/shopping?from=${next.from}&to=${next.to}`);
  }

  return (
    <ShoppingListBody
      key={`${range.from}:${range.to}`}
      from={range.from}
      to={range.to}
      today={t}
      onSelectRange={selectRange}
    />
  );
}

function ShoppingListBody({
  from,
  to,
  today: t,
  onSelectRange,
}: {
  from: string;
  to: string;
  today: string;
  onSelectRange: (range: { from: string; to: string }) => void;
}) {
  const [plans, setPlans] = useState<MealPlan[] | null>(() => cachedMealPlans(from, to));
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

  const items = useMemo(() => shoppingRowsFromPlans(plans ?? [], t), [plans, t]);

  function toggle(key: string) {
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
      .filter((i) => !checked.has(i.key))
      .map((i) => `・${i.foodName}${i.quantityText ? ` ${i.quantityText}` : ""}`)
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

  const sorted = [...items].sort((a, b) => Number(checked.has(a.key)) - Number(checked.has(b.key)));

  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {presets.map((p) => {
          const active = p.from === from && p.to === to;
          return (
            <button
              key={p.label}
              onClick={() => onSelectRange({ from: p.from, to: p.to })}
              className={`pressable shrink-0 rounded-full border px-4 py-1.5 text-sm ${
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

      {plans === null && loadError ? (
        <p className="mt-10 text-center text-muted">読み込めませんでした。通信状況を確認して開き直してください</p>
      ) : plans === null ? (
        <div className="mt-5 flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <Skeleton className="h-5 w-5 rounded-md" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
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
              const done = checked.has(item.key);
              return (
                <li key={item.key}>
                  <label className="pressable flex cursor-pointer items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={done}
                      onChange={() => toggle(item.key)}
                      className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                    />
                    <span className={`min-w-0 flex-1 ${done ? "text-muted line-through" : ""}`}>
                      <span className="flex justify-between gap-3">
                        <span className="font-medium">{item.foodName}</span>
                        <span className="shrink-0">{item.quantityText}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">{item.recipeTitles.join("・")}</span>
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
