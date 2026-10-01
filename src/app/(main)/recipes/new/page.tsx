import { RecipeImporter } from "@/components/recipe-importer";
import { PageHeader } from "@/components/ui";

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string | string[] }>;
}) {
  const { url } = await searchParams;
  return (
    <>
      <PageHeader title="レシピを追加" back="/" />
      <RecipeImporter initialUrl={typeof url === "string" ? url : undefined} />
    </>
  );
}
