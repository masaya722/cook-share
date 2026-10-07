export type Ingredient = {
  name: string;
  amount: string;
};

export type SourceType = "youtube" | "web" | "manual";

export type Recipe = {
  id: string;
  title: string;
  source_url: string | null;
  source_type: SourceType;
  image_url: string | null;
  servings: string | null;
  cook_time: string | null;
  description: string | null;
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type RecipeSummary = Pick<
  Recipe,
  "id" | "title" | "image_url" | "tags" | "source_type" | "cook_time" | "ingredients"
>;

export type RecipeDraft = Omit<Recipe, "id" | "created_at" | "updated_at">;

export function emptyDraft(): RecipeDraft {
  return {
    title: "",
    source_url: null,
    source_type: "manual",
    image_url: null,
    servings: null,
    cook_time: null,
    description: null,
    ingredients: [],
    steps: [],
    tags: [],
    memo: null,
  };
}
