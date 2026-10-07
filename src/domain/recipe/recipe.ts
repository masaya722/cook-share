import { DomainError } from "../shared/domain-error";
import { Ingredient } from "./ingredient";
import { Servings } from "./servings";

export type RecipeId = string & { readonly __brand: "RecipeId" };

/** 集約: レシピ */
export class Recipe {
  private constructor(
    readonly id: RecipeId,
    readonly title: string,
    readonly servings: Servings,
    readonly ingredients: readonly Ingredient[],
  ) {}

  /** R1: 料理名は必須 / R2: 材料の食材名は空にできない（Food が保証） */
  static create(props: {
    id: string;
    title: string;
    servings: Servings;
    ingredients: readonly Ingredient[];
  }): Recipe {
    const title = props.title.trim();
    if (!title) throw new DomainError("料理名を入力してください");
    return new Recipe(props.id as RecipeId, title, props.servings, props.ingredients);
  }

  /** 作る人数に合わせて増減した材料 */
  ingredientsFor(servingsToCook: number): Ingredient[] {
    const factor = servingsToCook / this.servings.count;
    return this.ingredients.map((i) => Ingredient.scale(i, factor));
  }
}
