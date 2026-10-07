import { describe, expect, it } from "vitest";
import type { RecipeId } from "../recipe/recipe";
import { calendarDate } from "../shared/calendar-date";
import { DomainError } from "../shared/domain-error";
import { type DishId, type DishInMeal, Meal } from "./meal";

const curry = "curry" as RecipeId;
const salad = "salad" as RecipeId;
const day = (d: string) => calendarDate(d);

function curryCookedFor(servingsToCook: number): DishInMeal {
  return { id: "d-curry" as DishId, recipeId: curry, servingsToCook, date: day("2026-10-08"), mealTime: "dinner" };
}

describe("食事", () => {
  it("品を加えると、作る人数は 2 人から始まる", () => {
    const meal = Meal.plan("m1", day("2026-10-08"), "dinner");
    const dish = meal.addDish("d1", curry);
    expect(dish.servingsToCook).toBe(2);
    expect(meal.pullEvents()).toEqual([
      { type: "DishAdded", dishId: "d1", recipeId: curry, servingsToCook: 2, date: "2026-10-08", mealTime: "dinner" },
    ]);
  });

  it("夜は品をいくつも並べられる", () => {
    const meal = Meal.plan("m1", day("2026-10-08"), "dinner");
    meal.addDish("d1", curry);
    meal.addDish("d2", salad);
    expect(meal.dishes).toHaveLength(2);
  });

  it("作る人数を変えると、変更前後の人数が記録される", () => {
    const meal = Meal.plan("m1", day("2026-10-08"), "dinner");
    const dish = meal.addDish("d1", curry);
    meal.pullEvents();
    meal.changeServings(dish.id, 4);
    expect(meal.pullEvents()).toEqual([{ type: "DishServingsChanged", dishId: "d1", from: 2, to: 4 }]);
  });

  it.each([0, -1, 1.5])("作る人数 %s 人は不可", (n) => {
    const meal = Meal.plan("m1", day("2026-10-08"), "dinner");
    const dish = meal.addDish("d1", curry);
    expect(() => meal.changeServings(dish.id, n)).toThrow(DomainError);
  });

  it("外食にすると品が外れ、外れたことが記録される", () => {
    const meal = Meal.plan("m1", day("2026-10-08"), "dinner");
    meal.addDish("d1", curry);
    meal.pullEvents();
    meal.markEatingOut();
    expect(meal.dishes).toHaveLength(0);
    expect(meal.pullEvents()).toEqual([
      { type: "DishRemoved", dishId: "d1" },
      { type: "EatingOutMarked", mealId: "m1" },
    ]);
  });

  it("外食の食事には品を入れられない", () => {
    const meal = Meal.plan("m1", day("2026-10-08"), "dinner");
    meal.markEatingOut();
    expect(() => meal.addDish("d1", curry)).toThrow("外食の日には品を入れられません");
  });

  it("品も残り物もなく外食でもない食事は空", () => {
    const meal = Meal.plan("m1", day("2026-10-08"), "dinner");
    expect(meal.isEmpty).toBe(true);
    meal.markEatingOut();
    expect(meal.isEmpty).toBe(false);
  });
});

describe("残り物", () => {
  it("前の食事で多めに作った品を、翌日の献立に入れられる", () => {
    const nextLunch = Meal.plan("m2", day("2026-10-09"), "lunch");
    nextLunch.addLeftover(curryCookedFor(4));
    expect(nextLunch.leftovers).toEqual([{ sourceDishId: "d-curry", recipeId: curry }]);
  });

  it("同じ日でも、後の食事なら入れられる（夜→翌朝ではなく、昼に作って夜に食べる）", () => {
    const source = { ...curryCookedFor(4), date: day("2026-10-08"), mealTime: "lunch" as const };
    const dinner = Meal.plan("m2", day("2026-10-08"), "dinner");
    expect(() => dinner.addLeftover(source)).not.toThrow();
  });

  it("多めに作っていない品は残り物にできない", () => {
    const next = Meal.plan("m2", day("2026-10-09"), "dinner");
    expect(() => next.addLeftover(curryCookedFor(2))).toThrow("多めに作った品だけ");
  });

  it("元の品より前の食事には入れられない", () => {
    const sameDinner = Meal.plan("m2", day("2026-10-08"), "dinner");
    const dayBefore = Meal.plan("m3", day("2026-10-07"), "dinner");
    expect(() => sameDinner.addLeftover(curryCookedFor(4))).toThrow("より前に作った品だけ");
    expect(() => dayBefore.addLeftover(curryCookedFor(4))).toThrow("より前に作った品だけ");
  });

  it("外食にすると残り物も外れる", () => {
    const next = Meal.plan("m2", day("2026-10-09"), "dinner");
    next.addLeftover(curryCookedFor(4));
    next.markEatingOut();
    expect(next.leftovers).toHaveLength(0);
  });
});
