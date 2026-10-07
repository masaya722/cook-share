import { Ingredient } from "@/domain/recipe/ingredient";
import { Recipe } from "@/domain/recipe/recipe";
import { Servings } from "@/domain/recipe/servings";
import type { Ingredient as IngredientRow, Recipe as RecipeRow } from "@/lib/types";

/** 古い形式（第 4 段階より前は文字列「2人分」）も読めるようにする */
function toServings(value: number | string | null): Servings {
  return typeof value === "string" ? Servings.parse(value) : Servings.fromCount(value);
}

/** 古い形式（「ニンニク(微塵切り)」のように下ごしらえが食材名に混ざっている）なら分けて読む */
function toIngredient(row: IngredientRow): Ingredient {
  return row.preparation === undefined
    ? Ingredient.fromName(row.name, row.amount ?? "")
    : Ingredient.of(row.name, row.amount ?? "", row.preparation);
}

/** DB の行をドメインのレシピに変換する */
export function toDomainRecipe(row: Pick<RecipeRow, "id" | "title" | "servings" | "ingredients">): Recipe {
  return Recipe.create({
    id: row.id,
    title: row.title,
    servings: toServings(row.servings),
    ingredients: row.ingredients.filter((i) => i.name.trim()).map(toIngredient),
  });
}

/** 編集画面に出す前に、古い形式の材料を「食材・分量・下ごしらえ」に分けておく */
export function normalizeIngredientRows(rows: IngredientRow[]): Required<IngredientRow>[] {
  return rows.map((row) => {
    if (row.preparation !== undefined || !row.name.trim()) {
      return { name: row.name, amount: row.amount ?? "", preparation: row.preparation ?? "" };
    }
    const i = toIngredient(row);
    // 分量は書かれたまま残す
    return { name: i.food.name, amount: row.amount ?? "", preparation: i.preparation };
  });
}
