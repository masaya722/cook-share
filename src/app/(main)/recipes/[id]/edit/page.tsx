import { notFound } from "next/navigation";
import { RecipeForm } from "@/components/recipe-form";
import { PageHeader } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { Recipe, RecipeDraft } from "@/lib/types";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();

  const recipe = data as Recipe;
  const draft: RecipeDraft = {
    title: recipe.title,
    source_url: recipe.source_url,
    source_type: recipe.source_type,
    image_url: recipe.image_url,
    servings: recipe.servings,
    cook_time: recipe.cook_time,
    description: recipe.description,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    tags: recipe.tags,
    memo: recipe.memo,
  };

  return (
    <>
      <PageHeader title="レシピを編集" back={`/recipes/${id}`} />
      <RecipeForm initial={draft} recipeId={id} />
    </>
  );
}
