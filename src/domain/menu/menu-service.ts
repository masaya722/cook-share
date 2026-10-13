import { DomainError } from "../shared/domain-error";
import { type DishId, isCookedExtra, type Meal, type MenuEvent } from "./meal";

/**
 * ドメインサービス: 複数の食事（集約）にまたがる献立のルール。
 * 1 つの食事の中だけでは判断できないので、食事のクラスではなくここに置く。
 * 関係する食事を読み込むのはアプリケーション層の役目で、ここは受け取った食事に対して判断だけをする。
 */

/**
 * M7: 品が献立から外れたら、その品を残り物にしていた食事からも残り物を外す。
 * 残り物を外した食事を返す（保存が必要なもの）。
 */
export function removeLeftoversOfRemovedDishes(
  events: readonly MenuEvent[],
  mealsWithLeftovers: readonly Meal[],
): Meal[] {
  const removed = events.flatMap((e) => (e.type === "DishRemoved" ? [e.dishId] : []));
  const changed: Meal[] = [];
  for (const meal of mealsWithLeftovers) {
    const before = meal.leftovers.length;
    for (const dishId of removed) meal.removeLeftover(dishId);
    if (meal.leftovers.length !== before) changed.push(meal);
  }
  return changed;
}

/**
 * M10: 残り物として献立に入っている品は、作る人数をいつもの人数以下に減らせない（先に残り物を外す）。
 * mealsUsingAsLeftover には、この品を残り物にしている食事を渡す。
 */
export function changeServings(
  meal: Meal,
  dishId: DishId,
  servingsToCook: number,
  mealsUsingAsLeftover: readonly Meal[],
) {
  const usedAsLeftover = mealsUsingAsLeftover.some((m) => m.leftovers.some((l) => l.sourceDishId === dishId));
  if (usedAsLeftover && !isCookedExtra(servingsToCook)) {
    throw new DomainError("残り物として献立に入れている日があります。先にその残り物を外してください");
  }
  meal.changeServings(dishId, servingsToCook);
}
