import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCalendarButton } from "@/components/add-to-calendar-button";
import { RecipeThumb } from "@/components/recipe-thumb";
import { PageHeader, subtleButtonClass } from "@/components/ui";
import { Servings } from "@/domain/recipe/servings";
import { normalizeIngredientRows } from "@/infrastructure/recipe-mapper";
import { createClient } from "@/lib/supabase/server";
import type { RecipeRow } from "@/lib/types";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const recipe = data as RecipeRow;
  // 古い形式の材料（下ごしらえが食材名に混ざっている）も、食材と下ごしらえに分けて見せる
  const ingredients = normalizeIngredientRows(recipe.ingredients);
  const servingsLabel = Servings.label(
    typeof recipe.servings === "string" ? Servings.parse(recipe.servings) : Servings.fromCount(recipe.servings),
  );

  return (
    <>
      <PageHeader
        title=""
        back="/"
        action={
          <Link href={`/recipes/${id}/edit`} className={subtleButtonClass}>
            編集
          </Link>
        }
      />
      <RecipeThumb
        src={recipe.image_url}
        sourceType={recipe.source_type}
        className="-mx-4 aspect-video sm:mx-0 sm:rounded-2xl"
      />

      <h1 className="mt-4 text-2xl font-bold leading-snug">{recipe.title}</h1>
      {recipe.description && <p className="mt-2 text-sm text-muted">{recipe.description}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-accent-soft px-3 py-1">🍽 {servingsLabel}</span>
        {recipe.cook_time && <span className="rounded-full bg-accent-soft px-3 py-1">⏱ {recipe.cook_time}</span>}
        {recipe.tags.map((t) => (
          <span key={t} className="rounded-full border border-border px-3 py-1 text-muted">
            {t}
          </span>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <AddToCalendarButton recipeId={recipe.id} />
        {recipe.source_url && /^https?:\/\//.test(recipe.source_url) && (
          <a href={recipe.source_url} target="_blank" rel="noreferrer" className={subtleButtonClass}>
            {recipe.source_type === "youtube" ? "動画を見る" : "元のページ"}
          </a>
        )}
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold">材料</h2>
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-muted">未登録</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {ingredients.map((ing, i) => (
              <li key={i} className="flex justify-between gap-4 px-4 py-2.5">
                <span>
                  {ing.name}
                  {ing.preparation && <span className="ml-1 text-sm text-muted">（{ing.preparation}）</span>}
                </span>
                <span className="shrink-0 text-muted">{ing.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-lg font-bold">作り方</h2>
        {recipe.steps.length === 0 ? (
          <p className="text-sm text-muted">未登録</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {recipe.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">
                  {i + 1}
                </span>
                <p className="leading-relaxed whitespace-pre-wrap">{step}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {recipe.memo && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold">メモ</h2>
          <p className="rounded-2xl bg-accent-soft p-4 leading-relaxed whitespace-pre-wrap">{recipe.memo}</p>
        </section>
      )}

      {recipe.source_images?.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold">元の画像</h2>
          <ul className="grid grid-cols-3 gap-2">
            {recipe.source_images
              .filter((src) => /^https?:\/\//.test(src))
              .map((src, i) => (
                <li key={src}>
                  <a href={src} target="_blank" rel="noreferrer" className="pressable block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 保存した元の画像をそのまま見せる */}
                    <img
                      src={src}
                      alt={`元の画像 ${i + 1}枚目`}
                      loading="lazy"
                      className="aspect-[3/4] w-full rounded-xl border border-border object-cover"
                    />
                  </a>
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  );
}
