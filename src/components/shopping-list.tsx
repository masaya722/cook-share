"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  openShoppingMemoAction,
  reflectMenuIngredientsAction,
  saveShoppingMemoAction,
  type ShoppingMemoView,
} from "@/app/actions";
import { addDays, type CalendarDate } from "@/domain/shared/calendar-date";
import {
  DONE_BOX,
  memoLines,
  mergeMemoText,
  normalizeText,
  OPEN_BOX,
  parseMemoLine,
  removeDoneLines,
  toggleLine,
} from "@/domain/shopping/shopping-memo";
import { createClient } from "@/lib/supabase/client";
import { useToday } from "@/lib/use-today";
import { ShoppingRowsSkeleton } from "./skeletons";
import { Spinner, subtleButtonClass } from "./ui";

// タブを行き来したときに前回の内容をすぐ出すための、端末内だけのキャッシュ
let cache: ShoppingMemoView | null = null;

const SAVE_FAILED = "保存できませんでした。通信状況を確認してください";
const SAVE_DELAY_MS = 800;

type Mode = "write" | "shop";
const MODE_KEY = "shopping-memo-mode";

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "shop" ? "shop" : "write";
  } catch {
    return "write";
  }
}

/** 献立の材料を反映する期間 */
const RANGES = [
  { label: "今日", from: 0, to: 0 },
  { label: "明日", from: 1, to: 1 },
  { label: "3日分", from: 0, to: 2 },
  { label: "1週間", from: 0, to: 6 },
];

/**
 * 買い物メモ。家族で 1 枚の、自由に書けるメモ帳。
 * 「書く」では普通のメモ帳として書き、「買い物中」では行をタップして ☐ ↔ ☑ を切り替える。
 * 書いた内容は少し待ってから自動で保存する。相手の保存とぶつかったら、行単位でまとめる。
 */
export function ShoppingList() {
  const today = useToday() as CalendarDate | null;
  // 最後にサーバーとそろえた内容（2 人の書き換えをまとめるときの「元」）
  const [base, setBase] = useState<ShoppingMemoView | null>(cache);
  const [text, setText] = useState(cache?.text ?? "");
  const [mode, setMode] = useState<Mode>("write");
  const [status, setStatus] = useState<"saved" | "saving" | "merged">("saved");
  const [error, setError] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState<string | null>(null);
  const [showRanges, setShowRanges] = useState(false);

  // 非同期の処理から最新の値を読むための控え
  const latest = useRef({ base, text });
  const saving = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function sync(next: { base?: ShoppingMemoView; text?: string }) {
    latest.current = { ...latest.current, ...next };
    if (next.base) {
      cache = next.base;
      setBase(next.base);
    }
    if (next.text !== undefined) setText(next.text);
  }

  // 前回選んだモード（書く / 買い物中）を端末ごとに覚えておく
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 端末に保存した設定はブラウザでしか読めない
    setMode(readMode());
  }, []);

  useEffect(() => {
    let cancelled = false;
    openShoppingMemoAction()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) return setError(result.error);
        // 読み込む前に書き始めていたら、行単位でまとめる
        const { base: b, text: t } = latest.current;
        const local = b && t !== b.text ? mergeMemoText(b.text, result.value.text, t) : result.value.text;
        sync({ base: result.value, text: local });
      })
      .catch(() => {
        if (!cancelled) setError("買い物メモを読み込めませんでした。通信状況を確認して開き直してください");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 手元の内容を保存する。保存中に呼ばれたら、終わってからもう一度保存する */
  async function save(): Promise<void> {
    clearTimeout(timer.current);
    if (saving.current) {
      await saving.current;
      return save();
    }
    const { base: b, text: sent } = latest.current;
    if (!b || sent === b.text) return setStatus("saved");

    setStatus("saving");
    saving.current = (async () => {
      const result = await saveShoppingMemoAction({ baseText: b.text, baseVersion: b.version, text: sent }).catch(
        () => ({ ok: false, error: SAVE_FAILED }) as const,
      );
      if (!result.ok) {
        setError(result.error);
        setStatus("saved");
        return;
      }
      setError(null);
      const saved = { text: result.value.text, version: result.value.version };
      const now = latest.current.text;
      // 保存している間にさらに書いていたら、その分は残す
      const local = now === sent ? saved.text : mergeMemoText(sent, saved.text, now);
      sync({ base: saved, text: local });
      setStatus(result.value.merged ? "merged" : "saved");
    })();
    try {
      await saving.current;
    } finally {
      saving.current = null;
    }
    if (latest.current.text !== latest.current.base?.text) scheduleSave();
  }

  function scheduleSave(delay = SAVE_DELAY_MS) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), delay);
  }

  function edit(next: string, delay?: number) {
    sync({ text: next });
    setStatus("saving");
    scheduleSave(delay);
  }

  // もう一人が保存したら、すぐ画面に反映する（書きかけがあれば行単位でまとめる）
  useEffect(() => {
    const supabase = createClient();
    const reload = async () => {
      const { data } = await supabase.from("shopping_memo").select("text, version").maybeSingle();
      const { base: b, text: t } = latest.current;
      if (!data || (b && data.version <= b.version)) return;
      const server = { text: normalizeText(data.text), version: data.version };
      const local = b && t !== b.text ? mergeMemoText(b.text, server.text, t) : server.text;
      sync({ base: server, text: local });
    };
    const channel = supabase
      .channel("shopping_memo")
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_memo" }, () => void reload())
      .subscribe();
    const onVisible = () => {
      if (document.visibilityState === "visible") void reload();
      // 画面を離れるときは、書きかけをすぐ保存する
      else void save();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
    // save は最新の値を latest から読むので、作り直す必要はない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reflect(range: (typeof RANGES)[number]) {
    if (!today) return;
    setShowRanges(false);
    setReflecting(range.label);
    setError(null);
    // 書きかけを先に保存してから反映する
    await save();
    const result = await reflectMenuIngredientsAction({
      from: addDays(today, range.from),
      to: addDays(today, range.to),
    }).catch(() => ({ ok: false, error: SAVE_FAILED }) as const);
    setReflecting(null);
    if (!result.ok) return setError(result.error);
    sync({ base: result.value, text: result.value.text });
    setStatus("saved");
  }

  function changeMode(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // 保存できなくても切り替えは効く
    }
  }

  const hasDone = memoLines(text).some((l) => {
    const line = parseMemoLine(l);
    return line.kind === "check" && line.done;
  });

  return (
    <>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 rounded-full bg-border/60 p-1 text-sm">
          {(
            [
              ["write", "✏️ 書く"],
              ["shop", "🛒 買い物中"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => changeMode(key)}
              className={`pressable flex-1 rounded-full py-1.5 ${mode === key ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="w-16 shrink-0 text-right text-xs text-muted" aria-live="polite">
          {status === "saving" ? "保存中…" : status === "merged" ? "まとめて保存" : base ? "保存済み ✓" : ""}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button className={subtleButtonClass} onClick={() => setShowRanges(!showRanges)} disabled={!!reflecting}>
          {reflecting ? (
            <>
              <Spinner /> {reflecting}の材料を反映中…
            </>
          ) : (
            "🍳 献立の材料を反映"
          )}
        </button>
        {mode === "shop" && (
          <button className={subtleButtonClass} onClick={() => edit(removeDoneLines(text), 0)} disabled={!hasDone}>
            ☑ を消す
          </button>
        )}
      </div>
      {showRanges && (
        <div className="mt-2 rounded-2xl border border-border bg-surface p-3">
          <p className="mb-2 text-xs text-muted">
            選んだ期間の献立のうち、まだ反映していない品の材料を、作る人数に合わせてメモの末尾に足します
          </p>
          <div className="flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <button key={r.label} className={subtleButtonClass} onClick={() => void reflect(r)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">{error}</p>}

      {base === null && !error ? (
        <ShoppingRowsSkeleton />
      ) : mode === "write" ? (
        <MemoEditor text={text} onChange={(t) => edit(t)} onBlur={() => void save()} />
      ) : (
        <ShoppingView text={text} onToggle={(i) => edit(toggleLine(text, i), 300)} />
      )}
    </>
  );
}

/**
 * 書く: 普通のメモ帳。☐ の行で Enter を押すと次の行にも ☐ が付き、空の ☐ 行で Enter を押すと ☐ が外れる。
 */
function MemoEditor({ text, onChange, onBlur }: { text: string; onChange: (text: string) => void; onBlur: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);

  // 書いた量に合わせて高さを伸ばし、☐ を足したときのカーソルの位置を戻す
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 240)}px`;
    if (caret.current !== null) {
      el.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [text]);

  /** カーソルのある行の範囲 */
  function currentLine(el: HTMLTextAreaElement) {
    const start = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const endIndex = el.value.indexOf("\n", el.selectionStart);
    const end = endIndex < 0 ? el.value.length : endIndex;
    return { start, end, line: el.value.slice(start, end) };
  }

  function replace(el: HTMLTextAreaElement, start: number, end: number, insert: string, nextCaret: number) {
    caret.current = nextCaret;
    onChange(el.value.slice(0, start) + insert + el.value.slice(end));
  }

  /** カーソルのある行に ☐ を付ける・外す */
  function toggleBox() {
    const el = ref.current;
    if (!el) return;
    const { start, end, line } = currentLine(el);
    const parsed = parseMemoLine(line);
    const next = parsed.kind === "check" ? parsed.text : `${OPEN_BOX} ${line}`;
    replace(el, start, end, next, start + next.length);
    el.focus();
  }

  return (
    <div className="mt-3 rounded-2xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          // ボタンを押してもカーソルが入力欄から外れないようにする
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleBox}
          className="pressable shrink-0 rounded-lg border border-border px-3 py-1 text-sm whitespace-nowrap"
        >
          {OPEN_BOX} チェック
        </button>
        <span className="text-xs text-muted">{OPEN_BOX} を付けた行は「買い物中」でチェックできます</span>
      </div>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
          const el = e.currentTarget;
          if (el.selectionStart !== el.selectionEnd) return;
          const { start, end, line } = currentLine(el);
          const parsed = parseMemoLine(line);
          if (parsed.kind !== "check") return;
          e.preventDefault();
          if (!parsed.text.trim()) {
            // 中身のない ☐ 行で Enter を押したら、☐ を外してチェックリストを終える
            replace(el, start, end, "", start);
          } else {
            const insert = `\n${OPEN_BOX} `;
            replace(el, el.selectionStart, el.selectionStart, insert, el.selectionStart + insert.length);
          }
        }}
        placeholder={`思いついた物を自由に書く\n例:\n🛒 スーパー\n${OPEN_BOX} 牛乳 2本\n${OPEN_BOX} 卵\n\n💊 ドラッグストア\n${OPEN_BOX} 靴洗剤`}
        aria-label="買い物メモ"
        className="block min-h-60 w-full resize-none rounded-b-2xl bg-transparent px-4 py-3 leading-7 outline-none placeholder:text-muted"
      />
    </div>
  );
}

/** 買い物中: キーボードを出さずに、行をタップして ☐ ↔ ☑ を切り替える */
function ShoppingView({ text, onToggle }: { text: string; onToggle: (index: number) => void }) {
  const lines = memoLines(text);
  if (!text.trim()) {
    return <p className="mt-10 text-center text-sm text-muted">メモは空です。「書く」で書き足してください</p>;
  }
  return (
    <ul className="mt-3 rounded-2xl border border-border bg-surface py-1">
      {lines.map((raw, i) => {
        const line = parseMemoLine(raw);
        if (line.kind === "text") {
          return raw.trim() ? (
            <li key={i} className="px-4 pt-3 pb-1 text-sm font-bold text-muted break-all">
              {line.text}
            </li>
          ) : (
            <li key={i} className="h-3" aria-hidden />
          );
        }
        return (
          <li key={i}>
            <button
              onClick={() => onToggle(i)}
              className="pressable flex w-full items-start gap-3 px-4 py-2.5 text-left"
              aria-pressed={line.done}
            >
              <span className={`text-xl leading-6 ${line.done ? "text-accent" : "text-muted"}`}>
                {line.done ? DONE_BOX : OPEN_BOX}
              </span>
              <span className={`flex-1 leading-6 break-all ${line.done ? "text-muted line-through" : ""}`}>
                {line.text}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
