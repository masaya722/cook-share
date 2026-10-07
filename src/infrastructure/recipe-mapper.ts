import { Ingredient } from "@/domain/recipe/ingredient";
import { Recipe } from "@/domain/recipe/recipe";
import { Servings } from "@/domain/recipe/servings";
import type { Recipe as RecipeRow } from "@/lib/types";

/** DB の行をドメインのレシピに変換する。食材と下ごしらえが混ざった古いデータもここで分ける */
export function toDomainRecipe(row: Pick<RecipeRow, "id" | "title" | "servings" | "ingredients">): Recipe {
  return Recipe.create({
    id: row.id,
    title: row.title,
    servings: Servings.parse(row.servings),
    ingredients: row.ingredients
      .filter((i) => i.name.trim())
      .map((i) => Ingredient.fromName(i.name, i.amount ?? "")),
  });
}
