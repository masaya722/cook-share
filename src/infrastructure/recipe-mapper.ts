import { Ingredient } from "@/domain/recipe/ingredient";
import { Recipe } from "@/domain/recipe/recipe";
import { Servings } from "@/domain/recipe/servings";
import { Source } from "@/domain/recipe/source";
import type { IngredientRow, RecipeDraft, RecipeRow } from "@/lib/types";

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

/** 保存済みのデータは読めることを優先し、ルールに合わない URL は出典なしとして読む（ルールは保存時に守らせる） */
function sourceOfSavedRow(kind: RecipeRow["source_type"], url: string | null): Source {
  try {
    return Source.of(kind, url);
  } catch {
    return Source.of(kind, null);
  }
}

/** DB の行をドメインのレシピに変換する。献立や買い物の計算だけなら、中身（作り方など）は無くてもよい */
export function toDomainRecipe(
  row: Pick<RecipeRow, "id" | "title" | "servings" | "ingredients"> & Partial<RecipeRow>,
): Recipe {
  return Recipe.create({
    id: row.id,
    title: row.title,
    servings: toServings(row.servings),
    ingredients: row.ingredients.filter((i) => i.name.trim()).map(toIngredient),
    content: {
      description: row.description,
      cookTime: row.cook_time,
      steps: row.steps,
      tags: row.tags,
      memo: row.memo,
      source: row.source_type ? sourceOfSavedRow(row.source_type, row.source_url ?? null) : undefined,
      imageUrl: row.image_url,
      sourceImages: row.source_images ?? [],
    },
  });
}

/**
 * 編集画面の入力からドメインのレシピを作る（ルールに反していれば DomainError）。
 * 食材名を入れていない材料の行は、追加しただけの空行として取り除く。
 */
export function recipeFromDraft(id: string, draft: RecipeDraft): Recipe {
  return Recipe.create({
    id,
    title: draft.title,
    servings: draft.servings === null ? Servings.assumed() : Servings.of(draft.servings),
    ingredients: draft.ingredients
      .filter((i) => i.name.trim())
      .map((i) => Ingredient.of(i.name, i.amount ?? "", i.preparation ?? "")),
    content: {
      description: draft.description,
      cookTime: draft.cook_time,
      steps: draft.steps,
      tags: draft.tags,
      memo: draft.memo,
      source: Source.of(draft.source_type, draft.source_url),
      imageUrl: draft.image_url,
      sourceImages: draft.source_images ?? [],
    },
  });
}

/** ドメインのレシピを、保存する DB の行（id・日時を除く）にする */
export function toRecipeRow(recipe: Recipe): RecipeDraft {
  const c = recipe.content;
  return {
    title: recipe.title,
    // 「記載なし（2 人分とみなす）」は null で保存する
    servings: recipe.servings.assumed ? null : recipe.servings.count,
    ingredients: recipe.ingredients.map((i) => ({
      name: i.food.name,
      amount: i.amountText,
      preparation: i.preparation,
    })),
    description: c.description,
    cook_time: c.cookTime,
    steps: [...c.steps],
    tags: [...c.tags],
    memo: c.memo,
    source_type: c.source.kind,
    source_url: c.source.url,
    image_url: c.imageUrl,
    source_images: [...c.sourceImages],
  };
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
