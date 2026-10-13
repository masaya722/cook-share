import { describe, expect, it } from "vitest";
import type { RecipeId } from "../recipe/recipe";
import { calendarDate } from "../shared/calendar-date";
import { DomainError } from "../shared/domain-error";
import { Meal } from "./meal";
import { changeServings, removeLeftoversOfRemovedDishes } from "./menu-service";

const curry = "curry" as RecipeId;
const day = (d: string) => calendarDate(d);

/** 月曜の夜にカレーを 4 人分作り、火曜と水曜の夜に残り物として食べる */
function curryWeek() {
  const monday = Meal.plan("mon", day("2026-10-12"), "dinner");
  const dish = monday.addDish("d-curry", curry, 4);
  const source = { ...dish, date: monday.date, mealTime: monday.mealTime };
  const tuesday = Meal.plan("tue", day("2026-10-13"), "dinner");
  tuesday.addLeftover(source);
  const wednesday = Meal.plan("wed", day("2026-10-14"), "dinner");
  wednesday.addLeftover(source);
  for (const m of [monday, tuesday, wednesday]) m.pullEvents();
  return { monday, tuesday, wednesday, dish };
}

describe("M7: 元の品が献立から外れたら、残り物も外れる", () => {
  it("その品を残り物にしていた食事すべてから外し、外した食事を返す", () => {
    const { monday, tuesday, wednesday, dish } = curryWeek();
    monday.removeDish(dish.id);

    const changed = removeLeftoversOfRemovedDishes(monday.pullEvents(), [tuesday, wednesday]);
    expect(changed).toEqual([tuesday, wednesday]);
    expect(tuesday.leftovers).toHaveLength(0);
    expect(wednesday.leftovers).toHaveLength(0);
  });

  it("外食で品が外れたときも同じ", () => {
    const { monday, tuesday } = curryWeek();
    monday.markEatingOut();
    removeLeftoversOfRemovedDishes(monday.pullEvents(), [tuesday]);
    expect(tuesday.leftovers).toHaveLength(0);
  });

  it("ほかの品が外れても、残り物はそのまま", () => {
    const { monday, tuesday } = curryWeek();
    const salad = monday.addDish("d-salad", "salad" as RecipeId);
    monday.pullEvents();
    monday.removeDish(salad.id);

    expect(removeLeftoversOfRemovedDishes(monday.pullEvents(), [tuesday])).toEqual([]);
    expect(tuesday.leftovers).toHaveLength(1);
  });
});

describe("M10: 残り物にしている品は、作る人数をいつもの人数以下に減らせない", () => {
  it("2 人分に減らそうとすると止める", () => {
    const { monday, tuesday, dish } = curryWeek();
    expect(() => changeServings(monday, dish.id, 2, [tuesday])).toThrow(DomainError);
    expect(monday.dishes[0].servingsToCook).toBe(4);
  });

  it("多めのままなら変えられる", () => {
    const { monday, tuesday, dish } = curryWeek();
    changeServings(monday, dish.id, 3, [tuesday]);
    expect(monday.dishes[0].servingsToCook).toBe(3);
  });

  it("残り物にしていなければ、2 人分に減らせる", () => {
    const { monday, dish } = curryWeek();
    changeServings(monday, dish.id, 2, []);
    expect(monday.dishes[0].servingsToCook).toBe(2);
  });
});
