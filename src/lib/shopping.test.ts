import { describe, expect, it } from "vitest";
import { shoppingRowsFromPlans } from "./shopping";
import type { MealPlan } from "./types";

function plan(id: string, date: string, title: string, servings: string | null, ingredients: [string, string][]): MealPlan {
  return {
    id,
    date,
    meal: "dinner",
    recipe_id: `r-${id}`,
    recipes: {
      id: `r-${id}`,
      title,
      image_url: null,
      servings,
      ingredients: ingredients.map(([name, amount]) => ({ name, amount })),
    },
  };
}

describe("今の献立データから買い物リストを作る", () => {
  it("部位の違う豚肉は混ぜず、下ごしらえだけ違うニンニクはまとめる", () => {
    const rows = shoppingRowsFromPlans(
      [
        plan("1", "2026-10-08", "生姜焼き", "2人分", [["豚肉（ロース）", "300g"], ["ニンニク(すりおろし)", "1片"]]),
        plan("2", "2026-10-09", "豚汁", "2人分", [["豚肉（ばら）", "100g"], ["ニンニク", "1片"]]),
      ],
      "2026-10-08",
    );
    const byName = Object.fromEntries(rows.map((r) => [r.foodName, r.quantityText]));
    expect(byName).toEqual({ "豚肉（ロース）": "300g", "豚肉（ばら）": "100g", ニンニク: "2片" });
  });

  it("1 人前のレシピは 2 人分に増やす。人数の記載がなければそのまま", () => {
    const rows = shoppingRowsFromPlans(
      [
        plan("1", "2026-10-08", "パスタ", "材料(1人前)", [["パスタ", "100g"]]),
        plan("2", "2026-10-09", "炒め物", null, [["もやし", "1袋"]]),
      ],
      "2026-10-08",
    );
    const byName = Object.fromEntries(rows.map((r) => [r.foodName, r.quantityText]));
    expect(byName).toEqual({ パスタ: "200g", もやし: "1袋" });
  });
});
