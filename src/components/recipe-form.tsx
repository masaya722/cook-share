"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteRecipeAction, upcomingUsesOfRecipeAction } from "@/app/actions";
import { MEAL_TIME_LABELS } from "@/domain/menu/meal";
import { formatShort, today } from "@/lib/date";
import { normalizeIngredientRows } from "@/infrastructure/recipe-mapper";
import { invalidateMeals } from "@/lib/meals";
import { createClient } from "@/lib/supabase/client";
import type { IngredientRow, RecipeDraft } from "@/lib/types";
import { ServingsStepper } from "./servings-stepper";
import { Spinner, buttonClass, inputClass, subtleButtonClass } from "./ui";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="削除" className="pressable shrink-0 px-2 text-xl text-muted">
      ×
    </button>
  );
}

export function RecipeForm({ initial, recipeId }: { initial: RecipeDraft; recipeId?: string }) {
  const router = useRouter();
  // 古い形式の材料（「ニンニク(微塵切り)」）は、開いた時点で食材と下ごしらえに分けておく
  const [draft, setDraft] = useState<RecipeDraft>(() => ({
    ...initial,
    ingredients: normalizeIngredientRows(initial.ingredients),
  }));
  const [tagsText, setTagsText] = useState(initial.tags.join("、"));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setIngredient = (i: number, patch: Partial<IngredientRow>) =>
    set(
      "ingredients",
      draft.ingredients.map((ing, j) => (j === i ? { ...ing, ...patch } : ing)),
    );

  const setStep = (i: number, value: string) =>
    set(
      "steps",
      draft.steps.map((s, j) => (j === i ? value : s)),
    );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) {
      setError("料理名を入力してください");
      return;
    }
    if (draft.source_url && !/^https?:\/\//.test(draft.source_url)) {
      setError("元の URL は http:// か https:// で始まる必要があります");
      return;
    }
    setSaving(true);
    setError(null);

    const payload: RecipeDraft = {
      ...draft,
      title: draft.title.trim(),
      ingredients: draft.ingredients
        .map((i) => ({ name: i.name.trim(), amount: i.amount.trim(), preparation: (i.preparation ?? "").trim() }))
        .filter((i) => i.name),
      steps: draft.steps.map((s) => s.trim()).filter(Boolean),
      tags: [...new Set(tagsText.split(/[、,\s]+/).map((t) => t.trim()).filter(Boolean))],
    };

    const supabase = createClient();
    const { data, error } = recipeId
      ? await supabase.from("recipes").update(payload).eq("id", recipeId).select("id").single()
      : await supabase.from("recipes").insert(payload).select("id").single();

    if (error || !data) {
      setError("保存できませんでした");
      setSaving(false);
      return;
    }
    router.replace(`/recipes/${data.id}`);
    router.refresh();
  }

  async function onDelete() {
    if (!recipeId) return;
    setSaving(true);
    setDeleting(true);
    // R5: 今日以降の献立で使っていれば、どの日かを見せてから確認する
    const uses = await upcomingUsesOfRecipeAction(recipeId, today()).catch(() => null);
    const upcoming =
      uses?.ok && uses.value.length > 0
        ? `${uses.value.map((u) => `${formatShort(u.date)} ${MEAL_TIME_LABELS[u.mealTime]}`).join("、")} の献立に入っています。\n`
        : "";
    if (!confirm(`${upcoming}このレシピを削除しますか？献立と買い物リストからも消えます`)) {
      setSaving(false);
      setDeleting(false);
      return;
    }
    // 献立からも消え、まだ買っていない材料は買い物リストからも消える
    const result = await deleteRecipeAction(recipeId);
    invalidateMeals();
    if (!result.ok) {
      setError(result.error);
      setSaving(false);
      setDeleting(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <Field label="料理名">
        <input className={inputClass} value={draft.title} onChange={(e) => set("title", e.target.value)} />
      </Field>

      <Field label="ひとこと説明">
        <textarea
          className={inputClass}
          rows={2}
          value={draft.description ?? ""}
          onChange={(e) => set("description", e.target.value || null)}
        />
      </Field>

      <section className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-muted">何人分のレシピか</span>
        <div className="flex min-h-11 items-center justify-between rounded-xl border border-border bg-surface px-3 py-1.5">
          {draft.servings === null ? (
            <>
              <span className="text-sm text-muted">記載なし（2人分とみなします）</span>
              <button type="button" className="pressable text-sm text-accent" onClick={() => set("servings", 2)}>
                人数を入れる
              </button>
            </>
          ) : (
            <>
              <ServingsStepper value={draft.servings} onChange={(n) => set("servings", n)} />
              <button type="button" className="pressable text-xs text-muted" onClick={() => set("servings", null)}>
                記載なしにする
              </button>
            </>
          )}
        </div>
      </section>

      <Field label="調理時間">
        <input
          className={inputClass}
          placeholder="30分"
          value={draft.cook_time ?? ""}
          onChange={(e) => set("cook_time", e.target.value || null)}
        />
      </Field>

      <section className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">材料</span>
        <span className="text-xs text-muted">食材は店で買う名前で（部位も書く: 豚ばら肉、鶏もも肉）。みじん切りなどは下ごしらえへ</span>
        {draft.ingredients.map((ing, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-xl border border-border p-2">
            <div className="flex items-center gap-2">
              <input
                className={`${inputClass} min-w-0 flex-[3]`}
                placeholder="食材（豚ばら肉）"
                aria-label="食材"
                value={ing.name}
                onChange={(e) => setIngredient(i, { name: e.target.value })}
              />
              <input
                className={`${inputClass} min-w-0 flex-[2]`}
                placeholder="分量（200g）"
                aria-label="分量"
                value={ing.amount}
                onChange={(e) => setIngredient(i, { amount: e.target.value })}
              />
              <RemoveButton onClick={() => set("ingredients", draft.ingredients.filter((_, j) => j !== i))} />
            </div>
            <input
              className={`${inputClass} py-1.5 text-sm`}
              placeholder="下ごしらえ（任意: みじん切り、薄切り など）"
              aria-label="下ごしらえ"
              value={ing.preparation ?? ""}
              onChange={(e) => setIngredient(i, { preparation: e.target.value })}
            />
          </div>
        ))}
        <button
          type="button"
          className={subtleButtonClass}
          onClick={() => set("ingredients", [...draft.ingredients, { name: "", amount: "", preparation: "" }])}
        >
          ＋ 材料を追加
        </button>
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-muted">作り方</span>
        {draft.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2.5 w-5 shrink-0 text-center text-sm font-bold text-accent">{i + 1}</span>
            <textarea
              className={inputClass}
              rows={2}
              value={step}
              onChange={(e) => setStep(i, e.target.value)}
            />
            <RemoveButton onClick={() => set("steps", draft.steps.filter((_, j) => j !== i))} />
          </div>
        ))}
        <button type="button" className={subtleButtonClass} onClick={() => set("steps", [...draft.steps, ""])}>
          ＋ 手順を追加
        </button>
      </section>

      <Field label="タグ（「、」区切り）">
        <input
          className={inputClass}
          placeholder="和食、鶏肉、作り置き"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
        />
      </Field>

      <Field label="メモ">
        <textarea
          className={inputClass}
          rows={3}
          placeholder="砂糖は少なめがうちの味、など"
          value={draft.memo ?? ""}
          onChange={(e) => set("memo", e.target.value || null)}
        />
      </Field>

      <Field label="元の URL">
        <input
          className={inputClass}
          type="url"
          value={draft.source_url ?? ""}
          onChange={(e) => set("source_url", e.target.value || null)}
        />
      </Field>

      <Field label="画像 URL">
        <input
          className={inputClass}
          type="url"
          value={draft.image_url ?? ""}
          onChange={(e) => set("image_url", e.target.value || null)}
        />
      </Field>

      {error && <p className="text-sm text-accent">{error}</p>}

      <div className="sticky bottom-20 flex gap-2 pt-2">
        {recipeId && (
          <button type="button" className={subtleButtonClass} onClick={onDelete} disabled={saving}>
            {deleting && <Spinner />}
            {deleting ? "削除中…" : "削除"}
          </button>
        )}
        <button type="submit" className={`${buttonClass} flex-1 py-3 shadow-lg`} disabled={saving}>
          {saving && !deleting && <Spinner />}
          {saving && !deleting ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  );
}
