import { DomainError } from "../shared/domain-error";
import { Ingredient } from "./ingredient";
import { Servings } from "./servings";
import { Source } from "./source";

export type RecipeId = string & { readonly __brand: "RecipeId" };

/** レシピの中身のうち、献立や買い物の計算には使わないもの */
export type RecipeContent = {
  readonly description: string | null;
  readonly cookTime: string | null;
  /** 作り方。1 要素 1 手順 */
  readonly steps: readonly string[];
  readonly tags: readonly string[];
  readonly memo: string | null;
  readonly source: Source;
  readonly imageUrl: string | null;
};

const textOrNull = (s: string | null | undefined) => s?.trim() || null;

/** 集約: レシピ */
export class Recipe {
  private constructor(
    readonly id: RecipeId,
    readonly title: string,
    readonly servings: Servings,
    readonly ingredients: readonly Ingredient[],
    readonly content: RecipeContent,
  ) {}

  /**
   * R1: 料理名は必須 / R2: 材料の食材名は空にできない（Food が保証）/ R7: 出典の URL（Source が保証）。
   * 空の手順や重複したタグは取り除く。
   */
  static create(props: {
    id: string;
    title: string;
    servings: Servings;
    ingredients: readonly Ingredient[];
    content?: Partial<RecipeContent>;
  }): Recipe {
    const title = props.title.trim();
    if (!title) throw new DomainError("料理名を入力してください");
    const c = props.content ?? {};
    return new Recipe(props.id as RecipeId, title, props.servings, props.ingredients, {
      description: textOrNull(c.description),
      cookTime: textOrNull(c.cookTime),
      steps: (c.steps ?? []).map((s) => s.trim()).filter(Boolean),
      tags: [...new Set((c.tags ?? []).map((t) => t.trim()).filter(Boolean))],
      memo: textOrNull(c.memo),
      source: c.source ?? Source.manual(),
      imageUrl: textOrNull(c.imageUrl),
    });
  }

  /** 作る人数に合わせて増減した材料 */
  ingredientsFor(servingsToCook: number): Ingredient[] {
    const factor = servingsToCook / this.servings.count;
    return this.ingredients.map((i) => Ingredient.scale(i, factor));
  }
}
