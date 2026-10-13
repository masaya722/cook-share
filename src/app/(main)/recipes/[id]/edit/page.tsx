import { notFound } from "next/navigation";
import { RecipeForm } from "@/components/recipe-form";
import { PageHeader } from "@/components/ui";
import { Servings } from "@/domain/recipe/servings";
import { createClient } from "@/lib/supabase/server";
import type { RecipeDraft, RecipeRow } from "@/lib/types";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("recipes").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();

  const recipe = data as RecipeRow;
  const draft: RecipeDraft = {
    title: recipe.title,
    source_url: recipe.source_url,
    source_type: recipe.source_type,
    image_url: recipe.image_url,
    // 第 4 段階より前の文字列（「2人分」）が残っていても数値にして渡す
    servings:
      typeof recipe.servings === "string"
        ? (({ count, assumed }) => (assumed ? null : count))(Servings.parse(recipe.servings))
        : recipe.servings,
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
