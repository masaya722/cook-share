import type { MenuEvent } from "../menu/meal";
import type { Recipe, RecipeId } from "../recipe/recipe";
import type { ShoppingList } from "./shopping-list";

/**
 * ポリシー: 献立で起きたことに反応して、買い物リストを自動で更新する。
 * - 品が献立に加わった → 作る人数に合わせた材料を加える
 * - 品が献立から外れた（取りやめ・外食・レシピ削除） → まだ買っていない物を消す
 * - 作る人数が変わった → まだリストにある物の分量を合わせる
 * 残り物は買い物を発生させない（M8）ので反応しない。
 */
export function applyMenuEvents(
  list: ShoppingList,
  events: readonly MenuEvent[],
  recipeOf: (id: RecipeId) => Recipe,
) {
  for (const event of events) {
    switch (event.type) {
      case "DishAdded": {
        const recipe = recipeOf(event.recipeId);
        list.addFromDish({
          dishId: event.dishId,
          recipeTitle: recipe.title,
          neededOn: event.date,
          ingredients: recipe.ingredientsFor(event.servingsToCook),
        });
        break;
      }
      case "DishRemoved":
        list.removeDish(event.dishId);
        break;
      case "DishServingsChanged":
        list.rescaleDish(event.dishId, event.from, event.to);
        break;
    }
  }
}
