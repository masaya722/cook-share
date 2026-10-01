import { RecipeGridSkeleton } from "@/components/skeletons";
import { PageHeader } from "@/components/ui";

export default function Loading() {
  return (
    <>
      <PageHeader title="レシピ" />
      <RecipeGridSkeleton />
    </>
  );
}
