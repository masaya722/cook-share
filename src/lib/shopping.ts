import { Meal } from "@/domain/menu/meal";
import { calendarDate } from "@/domain/shared/calendar-date";
import { applyMenuEvents } from "@/domain/shopping/menu-policy";
import { ShoppingList, type ShoppingRow } from "@/domain/shopping/shopping-list";
import { toDomainRecipe } from "@/infrastructure/recipe-mapper";
import type { MealPlan } from "./types";

/**
 * 献立から買い物リストの行を作る（買い物リストを保存するようになるまでのつなぎ）。
 * 今の献立は作る人数を持たないので、家族の人数（2 人分）で作る前提で材料を増減する。
 */
export function shoppingRowsFromPlans(plans: MealPlan[], today: string): ShoppingRow[] {
  const list = ShoppingList.reconstitute([]);
  for (const plan of plans) {
    if (!plan.recipes) continue;
    const recipe = toDomainRecipe(plan.recipes);
    const meal = Meal.plan(`meal-${plan.id}`, calendarDate(plan.date), plan.meal);
    meal.addDish(plan.id, recipe.id);
    applyMenuEvents(list, meal.pullEvents(), () => recipe);
  }
  return list.rows({ today: calendarDate(today) });
}
