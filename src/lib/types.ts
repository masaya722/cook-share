/**
 * DB の行の形。ドメインの Recipe・Ingredient（src/domain/recipe/）とは別物なので、名前に Row を付けて区別する。
 */

/**
 * 材料（DB の recipes.ingredients の 1 要素）。name は食材（店で買う物としての名前）。
 * 第 4 段階より前のデータには preparation が無く、name に下ごしらえが混ざっていることがある。
 */
export type IngredientRow = {
  name: string;
  amount: string;
  preparation?: string;
};

export type SourceType = "youtube" | "web" | "manual" | "image";

export type RecipeRow = {
  id: string;
  title: string;
  source_url: string | null;
  source_type: SourceType;
  image_url: string | null;
  /** 写真から取り込んだときの元の画像（公開 URL、選んだ順） */
  source_images: string[];
  /** 基準人数。記載がなければ null（2 人分とみなす） */
  servings: number | null;
  cook_time: string | null;
  description: string | null;
  ingredients: IngredientRow[];
  steps: string[];
  tags: string[];
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeSummary = Pick<
  RecipeRow,
  "id" | "title" | "image_url" | "tags" | "source_type" | "cook_time" | "ingredients"
>;

export type RecipeDraft = Omit<RecipeRow, "id" | "created_at" | "updated_at">;

export function emptyDraft(): RecipeDraft {
  return {
    title: "",
    source_url: null,
    source_type: "manual",
    image_url: null,
    source_images: [],
    servings: null,
    cook_time: null,
    description: null,
    ingredients: [],
    steps: [],
    tags: [],
    memo: null,
  };
}
