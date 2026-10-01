import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCalendarButton } from "@/components/add-to-calendar-button";
import { RecipeThumb } from "@/components/recipe-thumb";
import { PageHeader, subtleButtonClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { Recipe } from "@/lib/types";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const recipe = data as Recipe;

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
        {recipe.servings && <span className="rounded-full bg-accent-soft px-3 py-1">🍽 {recipe.servings}</span>}
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
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="flex justify-between gap-4 px-4 py-2.5">
                <span>{ing.name}</span>
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
    </>
  );
}
