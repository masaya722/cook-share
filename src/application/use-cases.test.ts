import { beforeEach, describe, expect, it } from "vitest";
import { Ingredient } from "@/domain/recipe/ingredient";
import { Recipe } from "@/domain/recipe/recipe";
import { Servings } from "@/domain/recipe/servings";
import { calendarDate } from "@/domain/shared/calendar-date";
import { InMemoryStore } from "./in-memory-store";
import {
  addShoppingItem,
  deleteRecipe,
  markBought,
  openShoppingList,
  planDish,
  removeDish,
  removeShoppingItems,
} from "./use-cases";

const today = calendarDate("2026-10-08");
const tomorrow = calendarDate("2026-10-09");

let store: InMemoryStore;
beforeEach(() => {
  store = new InMemoryStore();
  store.backfilled = true;
  store.recipes.set(
    "curry",
    Recipe.create({
      id: "curry",
      title: "カレー",
      servings: Servings.of(2),
      ingredients: [Ingredient.of("豚ばら肉", "200g"), Ingredient.of("玉ねぎ", "1個")],
    }),
  );
});

const foods = async () => (await openShoppingList(store, today)).map((i) => i.food.name).sort();

describe("献立を決めると買い物リストが変わる", () => {
  it("品を加えると材料が入り、外すと消える", async () => {
    await planDish(store, { dishId: "d1", date: today, mealTime: "dinner", recipeId: "curry" });
    expect(await foods()).toEqual(["玉ねぎ", "豚ばら肉"]);

    await removeDish(store, "d1");
    expect(await foods()).toEqual([]);
    expect(store.dishes.size).toBe(0);
  });

  it("レシピを削除すると、献立からも買い物リストからも消える。手で足した物は残る", async () => {
    await planDish(store, { dishId: "d1", date: tomorrow, mealTime: "dinner", recipeId: "curry" });
    await addShoppingItem(store, { food: "牛乳" });

    await deleteRecipe(store, "curry");
    expect(store.dishes.size).toBe(0);
    expect(await foods()).toEqual(["牛乳"]);
  });

  it("存在しないレシピは献立に入れられない", async () => {
    await expect(
      planDish(store, { dishId: "d1", date: today, mealTime: "dinner", recipeId: "nope" }),
    ).rejects.toThrow("レシピが見つかりません");
  });
});

describe("買い物リストを開く", () => {
  it("初回だけ、今日以降の献立の材料を入れる", async () => {
    store.backfilled = false;
    store.dishes.set("past", { id: "past", date: calendarDate("2026-10-07"), mealTime: "dinner", recipeId: "curry" });
    store.dishes.set("next", { id: "next", date: tomorrow, mealTime: "dinner", recipeId: "curry" });

    const items = await openShoppingList(store, today);
    expect(items.map((i) => i.origin.kind === "dish" && i.origin.dishId)).toEqual(["next", "next"]);
    expect(store.backfilled).toBe(true);

    // 2 回目は入れ直さない（手で消した物が復活しない）
    await removeShoppingItems(store, items.map((i) => i.id));
    expect(await openShoppingList(store, today)).toEqual([]);
  });

  it("前日までに買った物は消える", async () => {
    const milk = await addShoppingItem(store, { food: "牛乳" });
    await markBought(store, [milk.id], calendarDate("2026-10-07"));
    expect(await foods()).toEqual([]);
  });

  it("相手がもう消した買う物にチェックしても、エラーにならない", async () => {
    const milk = await addShoppingItem(store, { food: "牛乳" });
    await removeShoppingItems(store, [milk.id]);
    await expect(markBought(store, [milk.id], today)).resolves.toBeUndefined();
  });
});
