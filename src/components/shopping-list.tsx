"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addShoppingDividerAction,
  editShoppingItemAction,
  markBoughtAction,
  moveShoppingEntriesAction,
  openShoppingListAction,
  removeShoppingItemsAction,
  unmarkBoughtAction,
  writeShoppingAction,
} from "@/app/actions";
import { addDays, type CalendarDate, compareDates } from "@/domain/shared/calendar-date";
import {
  type DividerRow,
  ShoppingList as ShoppingListModel,
  type ShoppingItemId,
  type ShoppingRow,
} from "@/domain/shopping/shopping-list";
import {
  SHOPPING_ITEM_COLUMNS,
  type ShoppingItemRow,
  toShoppingEntry,
  toShoppingItemRow,
} from "@/infrastructure/shopping-item-mapper";
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

const SAVE_FAILED = "保存できませんでした。通信状況を確認してください";

type Result = { ok: true } | { ok: false; error: string };

/**
 * 画面側でもドメインの買い物リストを動かして、結果をすぐ画面に出す（保存はサーバーで同じ操作をする）。
 * 同じ入力からは同じ結果になるので、並べ替えなども保存の完了を待たずに反映できる。
 */
function applyLocally(rows: ShoppingItemRow[], change: (list: ShoppingListModel) => void): ShoppingItemRow[] {
  const list = ShoppingListModel.reconstitute(rows.map(toShoppingEntry));
  change(list);
  const { upserted, removedIds } = list.pullChanges();
  const removed = new Set<string>(removedIds);
  const updated = new Map(upserted.map((e) => [e.id as string, toShoppingItemRow(e)]));
  return [
    ...rows.filter((r) => !removed.has(r.id)).map((r) => updated.get(r.id) ?? r),
    ...[...updated.values()].filter((u) => !rows.some((r) => r.id === u.id)),
  ];
}

export function ShoppingList() {
  // 「今日」は端末の日付で決めるので、サーバーでは描画しない
  const today = useToday() as CalendarDate | null;
  return today ? <ShoppingListBody today={today} /> : <ShoppingSkeleton />;
}

function ShoppingListBody({ today }: { today: CalendarDate }) {
  const [items, setItems] = useState<ShoppingItemRow[] | null>(cache);
  const [withinDays, setWithinDays] = useState<number | undefined>(undefined);
  const [sorting, setSorting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // 保存の完了を待たずに続けて操作しても、最新の一覧をもとに変更できるようにする
  const itemsRef = useRef(items);

  function update(next: ShoppingItemRow[]) {
    cache = next;
    itemsRef.current = next;
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
          itemsRef.current = result.value;
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
        const { data } = await supabase.from("shopping_items").select(SHOPPING_ITEM_COLUMNS).order("position");
        if (data) {
          cache = data as unknown as ShoppingItemRow[];
          itemsRef.current = cache;
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

  const view = useMemo(
    () =>
      items
        ? ShoppingListModel.reconstitute(items.map(toShoppingEntry)).view({
            today,
            withinDays: sorting ? undefined : withinDays,
          })
        : null,
    [items, today, withinDays, sorting],
  );

  /** 画面を先に変え、保存に失敗したら元に戻す */
  async function change(local: (list: ShoppingListModel) => void, save: () => Promise<Result>) {
    const before = itemsRef.current ?? [];
    setError(null);
    try {
      update(applyLocally(before, local));
    } catch (e) {
      setError(e instanceof Error ? e.message : SAVE_FAILED);
      return;
    }
    const result = await save().catch((): Result => ({ ok: false, error: SAVE_FAILED }));
    if (!result.ok) {
      update(before);
      setError(result.error);
    }
  }

  function toggle(row: ShoppingRow) {
    const ids = [...row.itemIds];
    void change(
      (list) => (row.bought ? list.unmarkBought(ids) : list.markBought(ids, today)),
      () => (row.bought ? unmarkBoughtAction(ids) : markBoughtAction(ids, today)),
    );
  }

  function remove(ids: readonly ShoppingItemId[]) {
    void change(
      (list) => list.remove(ids),
      () => removeShoppingItemsAction([...ids]),
    );
  }

  function edit(row: ShoppingRow, text: string) {
    if (text.trim() === row.editText) return;
    const id = row.itemIds[0];
    void change(
      (list) => list.edit(id, text),
      () => editShoppingItemAction(id, text),
    );
  }

  function move(ids: readonly ShoppingItemId[], beforeId: ShoppingItemId | null) {
    void change(
      (list) => list.moveBefore(ids, beforeId),
      () => moveShoppingEntriesAction([...ids], beforeId),
    );
  }

  async function addDivider() {
    setError(null);
    const result = await addShoppingDividerAction().catch(() => ({ ok: false, error: SAVE_FAILED }) as const);
    if (result.ok) update([...(itemsRef.current ?? []), result.value]);
    else setError(result.error);
  }

  async function copyAsText() {
    const text = (view?.todo ?? [])
      .map((e) => (e.kind === "divider" ? "" : `・${e.name}${e.quantityText ? ` ${e.quantityText}` : ""}`))
      .join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const todoCount = view?.todo.filter((e) => e.kind === "row").length ?? 0;

  return (
    <>
      <QuickWrite
        onWritten={(rows) => update([...(itemsRef.current ?? []), ...rows])}
        onError={setError}
      />

      <div className="mt-4 flex items-center gap-2">
        <div className="-ml-4 flex flex-1 gap-2 overflow-x-auto pb-1 pl-4">
          {FILTERS.map((f) => (
            <button
              key={f.label}
              onClick={() => setWithinDays(f.withinDays)}
              disabled={sorting}
              className={`pressable shrink-0 rounded-full border px-3.5 py-1.5 text-sm disabled:opacity-40 ${
                !sorting && withinDays === f.withinDays
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-surface"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSorting(!sorting)}
          className={`pressable shrink-0 rounded-full border px-3.5 py-1.5 text-sm ${
            sorting ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"
          }`}
        >
          {sorting ? "完了" : "並べ替え"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">{error}</p>}

      {view === null && error ? null : view === null ? (
        <ShoppingRowsSkeleton />
      ) : view.todo.length === 0 && view.bought.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">
          買う物はありません
          <br />
          思いついた物を上に書くか、献立を決めると材料が入ります
        </p>
      ) : (
        <>
          <div className="mt-5 mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              買う物 <span className="text-sm font-normal text-muted">{todoCount}品</span>
            </h2>
            {sorting ? (
              <button className={subtleButtonClass} onClick={addDivider}>
                ＋ 区切り
              </button>
            ) : (
              <button className={subtleButtonClass} onClick={copyAsText} disabled={todoCount === 0}>
                {copied ? "コピーしました ✓" : "テキストでコピー"}
              </button>
            )}
          </div>
          {sorting && (
            <p className="mb-2 text-xs text-muted">右の ≡ を押したまま上下に動かします。区切りで振り分けられます</p>
          )}

          {view.todo.length > 0 ? (
            <EntryList
              entries={view.todo}
              today={today}
              sorting={sorting}
              onToggle={toggle}
              onRemove={remove}
              onEdit={edit}
              onMove={move}
            />
          ) : (
            <p className="py-4 text-center text-sm text-muted">全部買いました</p>
          )}

          {view.bought.length > 0 && !sorting && (
            <>
              <h2 className="mt-6 mb-2 text-sm font-bold text-muted">買った物（明日になると消えます）</h2>
              <EntryList
                entries={view.bought}
                today={today}
                sorting={false}
                onToggle={toggle}
                onRemove={remove}
                onEdit={edit}
                onMove={move}
              />
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

const idsOf = (e: ShoppingRow | DividerRow): ShoppingItemId[] => (e.kind === "row" ? [...e.itemIds] : [e.id]);
const anchorOf = (e: ShoppingRow | DividerRow): ShoppingItemId => (e.kind === "row" ? e.anchorId : e.id);

/** 買う物と区切りの一覧。並べ替えのときは ≡ を押したまま上下に動かせる */
function EntryList({
  entries,
  today,
  sorting,
  onToggle,
  onRemove,
  onEdit,
  onMove,
}: {
  entries: readonly (ShoppingRow | DividerRow)[];
  today: CalendarDate;
  sorting: boolean;
  onToggle: (row: ShoppingRow) => void;
  onRemove: (ids: readonly ShoppingItemId[]) => void;
  onEdit: (row: ShoppingRow, text: string) => void;
  onMove: (ids: readonly ShoppingItemId[], beforeId: ShoppingItemId | null) => void;
}) {
  const refs = useRef(new Map<string, HTMLLIElement>());
  const [drag, setDrag] = useState<{ key: string; startY: number; dy: number; beforeKey: string | null } | null>(null);

  /** 指の位置から、どの行の手前に入るかを決める（null なら一番下） */
  function beforeKeyAt(clientY: number, draggingKey: string): string | null {
    for (const e of entries) {
      if (e.key === draggingKey) continue;
      const rect = refs.current.get(e.key)?.getBoundingClientRect();
      if (rect && clientY < rect.top + rect.height / 2) return e.key;
    }
    return null;
  }

  function onPointerDown(e: React.PointerEvent, key: string) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ key, startY: e.clientY, dy: 0, beforeKey: beforeKeyAt(e.clientY, key) });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    setDrag({ ...drag, dy: e.clientY - drag.startY, beforeKey: beforeKeyAt(e.clientY, drag.key) });
  }

  function onPointerUp() {
    if (!drag) return;
    const moving = entries.find((e) => e.key === drag.key)!;
    const before = drag.beforeKey ? entries.find((e) => e.key === drag.beforeKey)! : null;
    const index = entries.indexOf(moving);
    // 同じ場所に置いたときは何もしない
    const unchanged = before ? entries[index + 1] === before : index === entries.length - 1;
    setDrag(null);
    if (!unchanged) onMove(idsOf(moving), before ? anchorOf(before) : null);
  }

  return (
    <ul className="rounded-2xl border border-border bg-surface">
      {entries.map((entry, i) => {
        const dragging = drag?.key === entry.key;
        const dropHere = drag && !dragging && drag.beforeKey === entry.key;
        const dropAtEnd = drag && drag.beforeKey === null && i === entries.length - 1;
        return (
          <li
            key={entry.key}
            ref={(el) => {
              if (el) refs.current.set(entry.key, el);
              else refs.current.delete(entry.key);
            }}
            style={dragging ? { transform: `translateY(${drag.dy}px)` } : undefined}
            className={`relative flex items-center border-border ${i > 0 ? "border-t" : ""} ${
              dragging ? "z-10 rounded-xl bg-surface shadow-lg" : ""
            } ${dropHere ? "before:absolute before:inset-x-3 before:-top-px before:h-0.5 before:bg-accent" : ""} ${
              dropAtEnd ? "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent" : ""
            }`}
          >
            {entry.kind === "divider" ? (
              <div className="flex min-h-9 flex-1 items-center px-4">
                <div className="h-px flex-1 bg-muted/40" />
                {sorting && (
                  <button
                    onClick={() => onRemove([entry.id])}
                    aria-label="区切りを消す"
                    className="pressable px-3 text-muted"
                  >
                    ×
                  </button>
                )}
              </div>
            ) : (
              <RowContent
                row={entry}
                today={today}
                sorting={sorting}
                onToggle={onToggle}
                onRemove={onRemove}
                onEdit={onEdit}
              />
            )}
            {sorting && (
              <span
                onPointerDown={(e) => onPointerDown(e, entry.key)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                aria-label="押したまま上下に動かす"
                className="flex cursor-grab touch-none items-center self-stretch px-4 text-xl text-muted select-none"
              >
                ≡
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RowContent({
  row,
  today,
  sorting,
  onToggle,
  onRemove,
  onEdit,
}: {
  row: ShoppingRow;
  today: CalendarDate;
  sorting: boolean;
  onToggle: (row: ShoppingRow) => void;
  onRemove: (ids: readonly ShoppingItemId[]) => void;
  onEdit: (row: ShoppingRow, text: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const when = neededOnLabel(row.neededOn, today);
  const note = [when, row.recipeTitles.join("・")].filter(Boolean).join("　");

  function finishEditing() {
    if (editing !== null) onEdit(row, editing);
    setEditing(null);
  }

  return (
    <div className="flex min-w-0 flex-1 items-start">
      <label className="pressable flex shrink-0 cursor-pointer py-3 pr-3 pl-4">
        <input
          type="checkbox"
          checked={row.bought}
          onChange={() => onToggle(row)}
          aria-label={`${row.name}を買った`}
          className="mt-1 h-5 w-5 accent-[var(--accent)]"
        />
      </label>

      {editing !== null ? (
        <input
          autoFocus
          value={editing}
          onChange={(e) => setEditing(e.target.value)}
          onBlur={finishEditing}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) e.currentTarget.blur();
            if (e.key === "Escape") setEditing(null);
          }}
          enterKeyHint="done"
          className={`${inputClass} my-1.5 py-1.5`}
        />
      ) : (
        <button
          type="button"
          onClick={() => row.editable && !row.bought && !sorting && setEditing(row.editText)}
          className={`min-w-0 flex-1 py-3 text-left ${row.bought ? "text-muted line-through" : ""}`}
        >
          <span className="flex justify-between gap-3">
            <span className="font-medium break-all">{row.name}</span>
            <span className="shrink-0">{row.quantityText}</span>
          </span>
          {note && <span className="block truncate text-xs text-muted">{note}</span>}
        </button>
      )}

      {!sorting && editing === null && (
        <button
          onClick={() => onRemove(row.itemIds)}
          aria-label={`${row.name}をリストから消す`}
          className="pressable shrink-0 px-4 py-3 text-lg text-muted"
        >
          ×
        </button>
      )}
    </div>
  );
}

/**
 * メモ帳のように書く欄。1 つ書いて Enter で次へ（キーボードは閉じない）。
 * 何行も貼り付けたら、1 行ずつ買う物になり、空行は区切りになる。
 */
function QuickWrite({
  onWritten,
  onError,
}: {
  onWritten: (rows: ShoppingItemRow[]) => void;
  onError: (message: string) => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  async function write(value: string) {
    if (!value.trim()) return;
    setPending((n) => n + 1);
    const result = await writeShoppingAction(value).catch(() => ({ ok: false, error: SAVE_FAILED }) as const);
    setPending((n) => n - 1);
    if (result.ok) onWritten(result.value);
    else onError(result.error);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void write(text);
        setText("");
        input.current?.focus();
      }}
      className="flex gap-2"
    >
      <input
        ref={input}
        className={`${inputClass} min-w-0 flex-1`}
        placeholder="思いついた物を書く（例: 牛乳 2本）"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (!pasted.includes("\n")) return;
          // 何行もまとめて貼り付けたら、そのまま書き足す
          e.preventDefault();
          void write(text ? `${text}\n${pasted}` : pasted);
          setText("");
        }}
        enterKeyHint="enter"
        autoComplete="off"
      />
      <button type="submit" className={`${buttonClass} shrink-0`} disabled={!text.trim()} aria-label="書き足す">
        {pending > 0 ? <Spinner /> : "＋"}
      </button>
    </form>
  );
}
