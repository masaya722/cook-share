"use client";

import { useEffect, useRef, useState } from "react";
import { emptyDraft, type RecipeDraft } from "@/lib/types";
import { RecipeForm } from "./recipe-form";
import { Spinner, buttonClass, inputClass, subtleButtonClass } from "./ui";

export function RecipeImporter({ initialUrl }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const autoStarted = useRef(false);
  const [elapsed, setElapsed] = useState(0);

  // 取り込みは数十秒かかるので、経過時間に応じて今やっていることを表示する
  useEffect(() => {
    if (!loading) return;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  async function runImport(target: string) {
    setElapsed(0);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: target.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "取り込みに失敗しました");
      setDraft(body.recipe);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  // Android の共有メニューから来たときは自動で取り込みを始める
  useEffect(() => {
    if (initialUrl && !autoStarted.current) {
      autoStarted.current = true;
      void runImport(initialUrl);
    }
  }, [initialUrl]);

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const found = text.match(/https?:\/\/\S+/)?.[0];
      if (found) setUrl(found);
    } catch {
      // クリップボードの許可がない場合は手で貼ってもらう
    }
  }

  if (draft) {
    return (
      <>
        <p className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-sm">
          読み取った内容です。確認・修正してから保存してください。
        </p>
        <RecipeForm initial={draft} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">YouTube 動画やレシピサイトの URL を貼り付けてください。材料と作り方を AI が読み取ります。</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void runImport(url);
        }}
      >
        <input
          type="url"
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v=..."
          className={inputClass}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <div className="flex gap-2">
          <button type="button" className={subtleButtonClass} onClick={pasteFromClipboard} disabled={loading}>
            貼り付け
          </button>
          <button type="submit" className={`${buttonClass} flex-1`} disabled={loading || !url.trim()}>
            {loading ? (
              <>
                <Spinner />
                読み取り中…
              </>
            ) : (
              "取り込む"
            )}
          </button>
        </div>
      </form>
      {loading && <ImportProgress elapsed={elapsed} />}
      {error && <p className="text-sm text-accent">{error}</p>}

      <div className="my-4 flex items-center gap-3 text-xs text-muted">
        <div className="h-px flex-1 bg-border" />
        または
        <div className="h-px flex-1 bg-border" />
      </div>
      <button className={subtleButtonClass} onClick={() => setDraft(emptyDraft())} disabled={loading}>
        手入力で作る
      </button>
    </div>
  );
}

const STEPS = [
  { from: 0, label: "ページを読み込んでいます" },
  { from: 4, label: "AI が材料と作り方を読み取っています" },
  { from: 25, label: "もう少しで終わります" },
];

function ImportProgress({ elapsed }: { elapsed: number }) {
  const current = STEPS.findLast((s) => elapsed >= s.from)!;
  // 30 秒前後で終わることが多いので、それを目安に進める（終わるまでは 95% で止める）
  const percent = Math.min(95, Math.round((1 - Math.exp(-elapsed / 15)) * 100));
  return (
    <div className="rounded-xl bg-accent-soft px-4 py-3" role="status" aria-live="polite">
      <div className="flex justify-between text-sm">
        <span>{current.label}</span>
        <span className="text-muted">{elapsed}秒</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-accent transition-[width] duration-1000" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">画面はこのままでお待ちください</p>
    </div>
  );
}
