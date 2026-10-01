import Link from "next/link";
import { RecipeList } from "@/components/recipe-list";
import { PageHeader, buttonClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import type { RecipeSummary } from "@/lib/types";

export default async function RecipesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select("id, title, image_url, tags, source_type, cook_time, ingredients")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="レシピ"
        action={
          <Link href="/recipes/new" className={buttonClass}>
            ＋ 追加
          </Link>
        }
      />
      <RecipeList recipes={(data ?? []) as RecipeSummary[]} />
    </>
  );
}
