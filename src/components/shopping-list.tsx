"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addShoppingItemAction,
  markBoughtAction,
  openShoppingListAction,
  removeShoppingItemsAction,
  unmarkBoughtAction,
} from "@/app/actions";
import { addDays, type CalendarDate, compareDates } from "@/domain/shared/calendar-date";
import { ShoppingList as ShoppingListModel, type ShoppingRow } from "@/domain/shopping/shopping-list";
import { type ShoppingItemRow, toShoppingItem } from "@/infrastructure/shopping-item-mapper";
import { formatShort } from "@/lib/date";
import { createClient } from "@/lib/supabase/client";
import { useToday } from "@/lib/use-today";
import { ShoppingRowsSkeleton, ShoppingSkeleton } from "./skeletons";
import { Spinner, buttonClass, inputClass, subtleButtonClass } from "./ui";

// タブを行き来したときに前回の内容をすぐ出すための、端末内だけのキャッシュ
let cache: ShoppingItemRow[] | null = null;

const FILTERS: { label: string; withinDays?: number }[] = [
  { label: "すべて" },
  { label: "今日", withinDays: 1 },
  { label: "3日以内", withinDays: 3 },
  { label: "1週間", withinDays: 7 },
];

export function ShoppingList() {
  // 「今日」は端末の日付で決めるので、サーバーでは描画しない
  const today = useToday() as CalendarDate | null;
  return today ? <ShoppingListBody today={today} /> : <ShoppingSkeleton />;
}

function ShoppingListBody({ today }: { today: CalendarDate }) {
  const [items, setItems] = useState<ShoppingItemRow[] | null>(cache);
  const [withinDays, setWithinDays] = useState<number | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function update(next: ShoppingItemRow[]) {
    cache = next;
    setItems(next);
  }

  // 開いたときにサーバーで「前日までに買った物を消す」などを済ませてから読み込む
  useEffect(() => {
    let cancelled = false;
    openShoppingListAction(today)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          cache = result.value;
          setItems(result.value);
        } else {
          setError(result.error);
        }
      })
      .catch(() => {
        if (!cancelled) setError("買い物リストを読み込めませんでした。通信状況を確認して開き直してください");
      });
    return () => {
      cancelled = true;
    };
  }, [today]);

  // もう一人が操作したら、すぐ画面に反映する
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const { data } = await supabase
          .from("shopping_items")
          .select("id, food, quantity, origin_dish_id, recipe_title, needed_on, bought_on")
          .order("created_at");
        if (data) {
          cache = data as ShoppingItemRow[];
          setItems(cache);
        }
      }, 300);
    };
    const channel = supabase
      .channel("shopping_items")
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_items" }, reload)
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  const rows = useMemo(
    () => (items ? ShoppingListModel.reconstitute(items.map(toShoppingItem)).rows({ today, withinDays }) : null),
    [items, today, withinDays],
  );

  /** 画面を先に変え、保存に失敗したら元に戻す */
  async function optimistic(next: ShoppingItemRow[], save: () => Promise<{ ok: boolean; error?: string }>) {
    const before = items ?? [];
    setError(null);
    update(next);
    const result = await save().catch(() => ({ ok: false, error: "保存できませんでした。通信状況を確認してください" }));
    if (!result.ok) {
      update(before);
      setError(result.error ?? "保存できませんでした");
    }
  }

  function toggle(row: ShoppingRow) {
    const ids = new Set<string>(row.itemIds);
    const boughtOn = row.bought ? null : today;
    void optimistic(
      (items ?? []).map((i) => (ids.has(i.id) ? { ...i, bought_on: boughtOn } : i)),
      () => (row.bought ? unmarkBoughtAction([...ids]) : markBoughtAction([...ids], today)),
    );
  }

  function remove(row: ShoppingRow) {
    const ids = new Set<string>(row.itemIds);
    void optimistic(
      (items ?? []).filter((i) => !ids.has(i.id)),
      () => removeShoppingItemsAction([...ids]),
    );
  }

  async function copyAsText() {
    const text = (rows ?? [])
      .filter((r) => !r.bought)
      .map((r) => `・${r.foodName}${r.quantityText ? ` ${r.quantityText}` : ""}`)
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const todo = rows?.filter((r) => !r.bought) ?? [];
  const bought = rows?.filter((r) => r.bought) ?? [];

  return (
    <>
      <AddItemForm onAdded={(row) => update([...(items ?? []), row])} onError={setError} />

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setWithinDays(f.withinDays)}
            className={`pressable shrink-0 rounded-full border px-4 py-1.5 text-sm ${
              withinDays === f.withinDays ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">{error}</p>}

      {rows === null && error ? null : rows === null ? (
        <ShoppingRowsSkeleton />
      ) : rows.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">
          買う物はありません
          <br />
          献立を決めると、材料が自動で入ります
        </p>
      ) : (
        <>
          <div className="mt-5 mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              買う物 <span className="text-sm font-normal text-muted">{todo.length}品</span>
            </h2>
            <button className={subtleButtonClass} onClick={copyAsText} disabled={todo.length === 0}>
              {copied ? "コピーしました ✓" : "テキストでコピー"}
            </button>
          </div>
          {todo.length > 0 ? (
            <RowList rows={todo} today={today} onToggle={toggle} onRemove={remove} />
          ) : (
            <p className="py-4 text-center text-sm text-muted">全部買いました</p>
          )}

          {bought.length > 0 && (
            <>
              <h2 className="mt-6 mb-2 text-sm font-bold text-muted">買った物（明日になると消えます）</h2>
              <RowList rows={bought} today={today} onToggle={toggle} onRemove={remove} />
            </>
          )}
        </>
      )}
    </>
  );
}

function neededOnLabel(neededOn: CalendarDate | null, today: CalendarDate): string | null {
  if (!neededOn) return null;
  if (neededOn === today) return "今日使う";
  if (neededOn === addDays(today, 1)) return "明日使う";
  if (compareDates(neededOn, today) < 0) return `${formatShort(neededOn)}に使う予定でした`;
  return `${formatShort(neededOn)}に使う`;
}

function RowList({
  rows,
  today,
  onToggle,
  onRemove,
}: {
  rows: ShoppingRow[];
  today: CalendarDate;
  onToggle: (row: ShoppingRow) => void;
  onRemove: (row: ShoppingRow) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
      {rows.map((row) => {
        const when = neededOnLabel(row.neededOn, today);
        return (
          <li key={row.key} className="flex items-start">
            <label className="pressable flex min-w-0 flex-1 cursor-pointer items-start gap-3 py-3 pl-4">
              <input
                type="checkbox"
                checked={row.bought}
                onChange={() => onToggle(row)}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
              />
              <span className={`min-w-0 flex-1 ${row.bought ? "text-muted line-through" : ""}`}>
                <span className="flex justify-between gap-3">
                  <span className="font-medium">{row.foodName}</span>
                  <span className="shrink-0">{row.quantityText}</span>
                </span>
                {(when || row.recipeTitles.length > 0) && (
                  <span className="block truncate text-xs text-muted">
                    {[when, row.recipeTitles.join("・")].filter(Boolean).join("　")}
                  </span>
                )}
              </span>
            </label>
            <button
              onClick={() => onRemove(row)}
              aria-label={`${row.foodName}をリストから消す`}
              className="pressable px-4 py-3 text-lg text-muted"
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function AddItemForm({
  onAdded,
  onError,
}: {
  onAdded: (row: ShoppingItemRow) => void;
  onError: (message: string) => void;
}) {
  const [food, setFood] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);
  const foodInput = useRef<HTMLInputElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!food.trim()) return;
    setSaving(true);
    const result = await addShoppingItemAction({ food, quantity }).catch(
      () => ({ ok: false, error: "保存できませんでした。通信状況を確認してください" }) as const,
    );
    setSaving(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onAdded(result.value);
    setFood("");
    setQuantity("");
    foodInput.current?.focus();
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2">
      <input
        ref={foodInput}
        className={`${inputClass} min-w-0 flex-[3]`}
        placeholder="牛乳・バナナなどを足す"
        value={food}
        onChange={(e) => setFood(e.target.value)}
        enterKeyHint="done"
      />
      <input
        className={`${inputClass} min-w-0 flex-[2]`}
        placeholder="分量（任意）"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />
      <button type="submit" className={`${buttonClass} shrink-0`} disabled={saving || !food.trim()} aria-label="足す">
        {saving ? <Spinner /> : "＋"}
      </button>
    </form>
  );
}
