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
import { LINE_BREAK, parseLines } from "@/domain/shopping/shopping-line";
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
import { subtleButtonClass } from "./ui";

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
type Entry = ShoppingRow | DividerRow;

/**
 * 画面側でもドメインの買い物リストを動かして、結果をすぐ画面に出す（保存はサーバーで同じ操作をする）。
 * 同じ入力からは同じ結果になるので、書き足し・並べ替えなども保存の完了を待たずに反映できる。
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

const idsOf = (e: Entry): ShoppingItemId[] => (e.kind === "row" ? [...e.itemIds] : [e.id]);
const anchorOf = (e: Entry): ShoppingItemId => (e.kind === "row" ? e.anchorId : e.id);
/** その id を含む行か区切りか */
const contains = (e: Entry, id: ShoppingItemId) => (e.kind === "row" ? e.itemIds.includes(id) : e.id === id);

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
  // 書き足す行をどの行の下に出すか（null なら末尾）
  const [draftAfter, setDraftAfter] = useState<ShoppingItemId | null>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
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
    () => (items ? ShoppingListModel.reconstitute(items.map(toShoppingEntry)).view({ today, withinDays }) : null),
    [items, today, withinDays],
  );

  /** 画面を先に変え、保存に失敗したら元に戻す */
  async function change(local: (list: ShoppingListModel) => void, save: () => Promise<Result>) {
    const before = itemsRef.current ?? [];
    setError(null);
    try {
      update(applyLocally(before, local));
    } catch (e) {
      setError(e instanceof Error ? e.message : SAVE_FAILED);
      return false;
    }
    const result = await save().catch((): Result => ({ ok: false, error: SAVE_FAILED }));
    if (!result.ok) {
      update(before);
      setError(result.error);
    }
    return result.ok;
  }

  /**
   * draftAfter の行の下に書き足す。新しい物の id は画面で決めてサーバーにも渡す（同じ結果になる）。
   * 書き足した後は、書き足す行が今書いた物のすぐ下に移る（Enter で続けて書ける）。
   */
  function write(text: string, afterId: ShoppingItemId | null) {
    const count = parseLines(text).length;
    if (count === 0) return;
    const newIds = Array.from({ length: count }, () => crypto.randomUUID());
    setDraftAfter(newIds.at(-1)! as ShoppingItemId);
    void change(
      (list) => {
        list.write(text, { afterId, newIds });
      },
      () => writeShoppingAction({ text, afterId, newIds }),
    );
  }

  /** 書き足す行をこの行の下に出して、キーボードを閉じずにそこへ移る */
  function openDraftAfter(id: ShoppingItemId) {
    setDraftAfter(id);
    draftRef.current?.focus();
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

  /** 1 行の文章として直す。全部消したら、メモ帳で行を消したのと同じくリストから消す */
  function edit(row: ShoppingRow, text: string) {
    if (!text.trim()) return remove(row.itemIds);
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
  // 絞り込み中は一部の行しか見えず、並べ替えると見えない行との順番がずれるので、すべて表示のときだけ動かせる
  const reorderable = withinDays === undefined;

  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
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

      {view === null && error ? null : view === null ? (
        <ShoppingRowsSkeleton />
      ) : (
        <>
          <div className="mt-4 mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              買う物 <span className="text-sm font-normal text-muted">{todoCount}品</span>
            </h2>
            <div className="flex gap-2">
              <button className={subtleButtonClass} onClick={addDivider}>
                ＋ 区切り
              </button>
              <button className={subtleButtonClass} onClick={copyAsText} disabled={todoCount === 0}>
                {copied ? "コピー済 ✓" : "コピー"}
              </button>
            </div>
          </div>
          <p className="mb-2 text-xs text-muted">
            行をタップして直し、Enter ですぐ下に書き足せます。
            {reorderable ? "右の ≡ を押したまま動かすと並べ替え" : "並べ替えは「すべて」のときにできます"}
          </p>

          <EntryList
            entries={view.todo}
            today={today}
            reorderable={reorderable}
            draft={{ afterId: draftAfter, onWrite: write, onReset: () => setDraftAfter(null) }}
            draftInputRef={draftRef}
            onToggle={toggle}
            onRemove={remove}
            onEdit={edit}
            onOpenDraftAfter={openDraftAfter}
            onWriteAfter={write}
            onMove={move}
          />
          {todoCount === 0 && view.bought.length > 0 && (
            <p className="py-3 text-center text-sm text-muted">全部買いました</p>
          )}

          {view.bought.length > 0 && (
            <>
              <h2 className="mt-6 mb-2 text-sm font-bold text-muted">買った物（明日になると消えます）</h2>
              <EntryList
                entries={view.bought}
                today={today}
                reorderable={false}
                onToggle={toggle}
                onRemove={remove}
                onEdit={edit}
                onOpenDraftAfter={openDraftAfter}
                onWriteAfter={write}
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

type DraftProps = {
  afterId: ShoppingItemId | null;
  onWrite: (text: string, afterId: ShoppingItemId | null) => void;
  onReset: () => void;
};

/** 買う物と区切りの一覧。reorderable なら ≡ を押したまま上下に動かせる。draft があれば書き足す行を出す */
function EntryList({
  entries,
  today,
  reorderable,
  draft,
  draftInputRef,
  onToggle,
  onRemove,
  onEdit,
  onOpenDraftAfter,
  onWriteAfter,
  onMove,
}: {
  entries: readonly Entry[];
  today: CalendarDate;
  reorderable: boolean;
  draft?: DraftProps;
  draftInputRef?: React.Ref<HTMLTextAreaElement>;
  onToggle: (row: ShoppingRow) => void;
  onRemove: (ids: readonly ShoppingItemId[]) => void;
  onEdit: (row: ShoppingRow, text: string) => void;
  onOpenDraftAfter: (id: ShoppingItemId) => void;
  onWriteAfter: (text: string, afterId: ShoppingItemId | null) => void;
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

  // 書き足す行を差し込む場所（見えている行になければ末尾）
  const draftIndex = draft?.afterId ? entries.findIndex((e) => contains(e, draft.afterId!)) : -1;
  const items: ({ kind: "entry"; entry: Entry } | { kind: "draft" })[] = entries.map((entry) => ({
    kind: "entry",
    entry,
  }));
  if (draft) items.splice(draftIndex >= 0 ? draftIndex + 1 : items.length, 0, { kind: "draft" });

  return (
    <ul className="rounded-2xl border border-border bg-surface">
      {items.map((item, i) => {
        const border = i > 0 ? "border-t" : "";
        if (item.kind === "draft") {
          // 同じ key のまま場所だけ動かすので、入力欄が作り直されず、キーボードも閉じない
          return (
            <li key="draft" className={`flex items-center border-border ${border}`}>
              <DraftRow
                draft={draft!}
                inputRef={draftInputRef}
                afterId={draftIndex >= 0 ? anchorOfDraftTarget(entries, draft!.afterId!) : null}
              />
            </li>
          );
        }
        const entry = item.entry;
        const dragging = drag?.key === entry.key;
        const dropHere = drag && !dragging && drag.beforeKey === entry.key;
        const dropAtEnd = drag && drag.beforeKey === null && entry === entries.at(-1);
        return (
          <li
            key={entry.key}
            ref={(el) => {
              if (el) refs.current.set(entry.key, el);
              else refs.current.delete(entry.key);
            }}
            style={dragging ? { transform: `translateY(${drag.dy}px)` } : undefined}
            className={`relative flex items-center border-border ${border} ${
              dragging ? "z-10 rounded-xl bg-surface shadow-lg" : ""
            } ${dropHere ? "before:absolute before:inset-x-3 before:-top-px before:h-0.5 before:bg-accent" : ""} ${
              dropAtEnd ? "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent" : ""
            }`}
          >
            {entry.kind === "divider" ? (
              <div className="flex min-h-9 flex-1 items-center pl-4">
                <div className="h-px flex-1 bg-muted/40" />
                <button
                  onClick={() => onRemove([entry.id])}
                  aria-label="区切りを消す"
                  className="pressable px-3 text-muted"
                >
                  ×
                </button>
              </div>
            ) : (
              <RowContent
                row={entry}
                today={today}
                onToggle={onToggle}
                onRemove={onRemove}
                onEdit={onEdit}
                onOpenDraftAfter={onOpenDraftAfter}
                onWriteAfter={onWriteAfter}
              />
            )}
            {reorderable && (
              <span
                onPointerDown={(e) => onPointerDown(e, entry.key)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                aria-label="押したまま上下に動かす"
                className="-ml-2 flex cursor-grab touch-none items-center self-stretch pr-4 pl-1 text-xl text-muted/70 select-none"
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

/** 書き足す行の下に入れるときの目印（その行の一番上にある買う物、または区切り） */
function anchorOfDraftTarget(entries: readonly Entry[], id: ShoppingItemId): ShoppingItemId {
  const entry = entries.find((e) => contains(e, id));
  return entry ? anchorOf(entry) : id;
}

/**
 * 書き足す行。タップして書き、Enter ですぐ下に次の行が出る（キーボードは閉じない）。
 * 何行も貼り付けたら、1 行ずつ買う物になり、空行は区切りになる。
 * 1 行用の入力欄（input）は貼り付けた改行を消してしまうので、textarea を 1 行の見た目で使う。
 */
function DraftRow({
  draft,
  inputRef,
  afterId,
}: {
  draft: DraftProps;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  afterId: ShoppingItemId | null;
}) {
  const [text, setText] = useState("");

  function commit(value: string) {
    setText("");
    if (value.trim()) draft.onWrite(value, afterId);
  }

  return (
    <div className="flex min-w-0 flex-1 items-center">
      <span className="flex w-12 shrink-0 justify-center text-lg text-muted">＋</span>
      <textarea
        ref={inputRef}
        rows={1}
        value={text}
        placeholder="書き足す（例: 牛乳 2本）"
        aria-label="買う物を書き足す"
        className="min-w-0 flex-1 resize-none bg-transparent py-3 pr-4 leading-6 outline-none placeholder:text-muted"
        onChange={(e) => {
          // 貼り付けなどで改行が入ったら（Android の Enter も）、そのまま書き足す
          if (LINE_BREAK.test(e.target.value)) commit(e.target.value);
          else setText(e.target.value);
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          if (!LINE_BREAK.test(pasted)) return;
          e.preventDefault();
          commit(text ? `${text}\n${pasted}` : pasted);
        }}
        onKeyDown={(e) => {
          // 変換中の Enter（日本語入力の確定）では書き足さない
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            commit(text);
          }
          // 何も書いていない行で Backspace を押したら、末尾に戻す
          if (e.key === "Backspace" && !text) draft.onReset();
        }}
        onBlur={() => {
          // 書きかけのまま離れたら書き足す。何も書いていなければ末尾に戻す
          if (text.trim()) commit(text);
          else draft.onReset();
        }}
        enterKeyHint="enter"
        autoComplete="off"
      />
    </div>
  );
}

function RowContent({
  row,
  today,
  onToggle,
  onRemove,
  onEdit,
  onOpenDraftAfter,
  onWriteAfter,
}: {
  row: ShoppingRow;
  today: CalendarDate;
  onToggle: (row: ShoppingRow) => void;
  onRemove: (ids: readonly ShoppingItemId[]) => void;
  onEdit: (row: ShoppingRow, text: string) => void;
  onOpenDraftAfter: (id: ShoppingItemId) => void;
  onWriteAfter: (text: string, afterId: ShoppingItemId | null) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const when = neededOnLabel(row.neededOn, today);
  const note = [when, row.recipeTitles.join("・")].filter(Boolean).join("　");

  function finishEditing() {
    if (editing !== null) onEdit(row, editing);
    setEditing(null);
  }

  function onTap() {
    if (row.bought) return;
    // まとめた行（献立の材料が合算されている等）は直せないので、すぐ下に書き足す
    if (row.editable) setEditing(row.editText);
    else onOpenDraftAfter(row.anchorId);
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
        <textarea
          autoFocus
          rows={1}
          value={editing}
          onChange={(e) => {
            // 直している最中に改行が入ったら（Android の Enter など）、ここで確定してすぐ下に書き足す行へ
            if (LINE_BREAK.test(e.target.value)) {
              const [first, ...rest] = e.target.value.split(LINE_BREAK);
              setEditing(first);
              if (rest.join("").trim()) onWriteAfter(rest.join("\n"), row.anchorId);
              else onOpenDraftAfter(row.anchorId);
            } else {
              setEditing(e.target.value);
            }
          }}
          onBlur={finishEditing}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            if (!LINE_BREAK.test(pasted)) return;
            // 何行も貼り付けたら、この行の下にまとめて書き足す
            e.preventDefault();
            onWriteAfter(pasted, row.anchorId);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              // 書き足す行へ移ると、この欄が離れて（blur）直した内容が保存される
              onOpenDraftAfter(row.anchorId);
            }
            if (e.key === "Escape") setEditing(null);
          }}
          enterKeyHint="enter"
          className="my-1.5 min-w-0 flex-1 resize-none rounded-lg border border-accent bg-surface px-2 py-1.5 leading-6 outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={onTap}
          className={`min-w-0 flex-1 py-3 text-left ${row.bought ? "text-muted line-through" : ""}`}
        >
          <span className="flex justify-between gap-3">
            <span className="font-medium break-all">{row.name}</span>
            <span className="shrink-0">{row.quantityText}</span>
          </span>
          {note && <span className="block truncate text-xs text-muted">{note}</span>}
        </button>
      )}

      {editing === null && (
        <button
          onClick={() => onRemove(row.itemIds)}
          aria-label={`${row.name}をリストから消す`}
          className="pressable shrink-0 px-3 py-3 text-lg text-muted"
        >
          ×
        </button>
      )}
    </div>
  );
}
