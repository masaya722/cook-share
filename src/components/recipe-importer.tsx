"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { MAX_IMAGES } from "@/lib/import/images";
import { uploadRecipeImages } from "@/lib/import/upload-images";
import { emptyDraft, type RecipeDraft } from "@/lib/types";
import { RecipeForm } from "./recipe-form";
import { Spinner, buttonClass, inputClass, subtleButtonClass } from "./ui";

export function RecipeImporter({ initialUrl }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  // どちらから取り込んでいるか（経過の表示を変えるため）
  const [loading, setLoading] = useState<"url" | "images" | false>(false);
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);
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

  async function requestImport(body: { url: string } | { images: string[] }) {
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "取り込みに失敗しました");
    setDraft(json.recipe);
  }

  async function run(kind: "url" | "images", task: () => Promise<void>) {
    setElapsed(0);
    setLoading(kind);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取り込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  function runImport(target: string) {
    return run("url", () => requestImport({ url: target.trim() }));
  }

  /** 写真を縮小してアップロードし、選んだ順に 1 つのレシピとして読み取る */
  function runImageImport() {
    return run("images", async () => {
      const images = await uploadRecipeImages(photos.map((p) => p.file));
      await requestImport({ images });
    });
  }

  function addPhotos(files: FileList | null) {
    const added = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
    const next = [...photos, ...added.map((file) => ({ file, preview: URL.createObjectURL(file) }))];
    if (next.length > MAX_IMAGES) setError(`写真は ${MAX_IMAGES} 枚まで選べます`);
    else setError(null);
    setPhotos(next.slice(0, MAX_IMAGES));
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(photos[index].preview);
    setPhotos(photos.filter((_, i) => i !== index));
  }

  // Android の共有メニューから来たときは自動で取り込みを始める
  const startSharedImport = useEffectEvent((shared: string) => void runImport(shared));
  useEffect(() => {
    if (initialUrl && !autoStarted.current) {
      autoStarted.current = true;
      startSharedImport(initialUrl);
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
          disabled={!!loading}
        />
        <div className="flex gap-2">
          <button type="button" className={subtleButtonClass} onClick={pasteFromClipboard} disabled={!!loading}>
            貼り付け
          </button>
          <button type="submit" className={`${buttonClass} flex-1`} disabled={!!loading || !url.trim()}>
            {loading === "url" ? (
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
      {loading === "url" && <ImportProgress elapsed={elapsed} steps={URL_STEPS} />}
      {error && <p className="text-sm text-accent">{error}</p>}

      <Divider />

      <p className="text-sm text-muted">
        料理本・雑誌のページやスクリーンショットから取り込めます。材料と作り方が別の写真なら、まとめて選んでください（{MAX_IMAGES}枚まで、選んだ順に読みます）。
      </p>
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          addPhotos(e.target.files);
          e.target.value = "";
        }}
      />
      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <li key={p.preview} className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-surface">
              {/* eslint-disable-next-line @next/next/no-img-element -- 端末内の画像をそのまま見せる */}
              <img src={p.preview} alt={`${i + 1}枚目`} className="h-full w-full object-cover" />
              <span className="absolute top-1 left-1 rounded-full bg-black/60 px-2 text-xs text-white">{i + 1}</span>
              <button
                type="button"
                onClick={() => removePhoto(i)}
                disabled={!!loading}
                aria-label={`${i + 1}枚目を外す`}
                className="pressable absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={`${subtleButtonClass} ${photos.length === 0 ? "flex-1" : ""}`}
          onClick={() => photoInput.current?.click()}
          disabled={!!loading || photos.length >= MAX_IMAGES}
        >
          📷 {photos.length === 0 ? "写真を選ぶ" : "追加"}
        </button>
        {photos.length > 0 && (
          <button type="button" className={`${buttonClass} flex-1`} onClick={runImageImport} disabled={!!loading}>
            {loading === "images" ? (
              <>
                <Spinner />
                読み取り中…
              </>
            ) : (
              `${photos.length}枚から読み取る`
            )}
          </button>
        )}
      </div>
      {loading === "images" && <ImportProgress elapsed={elapsed} steps={IMAGE_STEPS} />}

      <Divider />
      <button className={subtleButtonClass} onClick={() => setDraft(emptyDraft())} disabled={!!loading}>
        手入力で作る
      </button>
    </div>
  );
}

function Divider() {
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-muted">
      <div className="h-px flex-1 bg-border" />
      または
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

type Step = { from: number; label: string };

const URL_STEPS: Step[] = [
  { from: 0, label: "ページを読み込んでいます" },
  { from: 4, label: "AI が材料と作り方を読み取っています" },
  { from: 25, label: "もう少しで終わります" },
];

const IMAGE_STEPS: Step[] = [
  { from: 0, label: "写真を送っています" },
  { from: 3, label: "AI が写真から材料と作り方を読み取っています" },
  { from: 25, label: "もう少しで終わります" },
];

function ImportProgress({ elapsed, steps }: { elapsed: number; steps: Step[] }) {
  const current = steps.findLast((s) => elapsed >= s.from)!;
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
