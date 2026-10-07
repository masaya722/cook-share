import { beforeEach, describe, expect, it } from "vitest";
import { Quantity } from "@/domain/recipe/quantity";
import { Ingredient } from "@/domain/recipe/ingredient";
import { Recipe } from "@/domain/recipe/recipe";
import { Servings } from "@/domain/recipe/servings";
import { calendarDate } from "@/domain/shared/calendar-date";
import { InMemoryStore } from "./in-memory-store";
import {
  addLeftover,
  addShoppingItem,
  cancelEatingOut,
  changeServings,
  deleteRecipe,
  markBought,
  markEatingOut,
  openShoppingList,
  planDish,
  removeDish,
  removeLeftover,
  removeShoppingItems,
  upcomingUsesOfRecipe,
} from "./use-cases";

const today = calendarDate("2026-10-08");
const tomorrow = calendarDate("2026-10-09");

let store: InMemoryStore;
let seq: number;
const newId = () => `id-${++seq}`;

beforeEach(() => {
  seq = 0;
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

async function shopping() {
  const items = await openShoppingList(store, today);
  return Object.fromEntries(items.map((i) => [i.food.name, Quantity.format(i.quantity)]));
}

async function planCurry(date = today, servingsToCook?: number) {
  await planDish(store, { date, mealTime: "dinner", recipeId: "curry", servingsToCook }, newId);
  return store.allDishes().at(-1)!.id;
}

describe("品を献立に入れる・外す", () => {
  it("品を加えると材料が入り、外すと消える。空になった食事は残らない", async () => {
    const dishId = await planCurry();
    expect(await shopping()).toEqual({ 豚ばら肉: "200g", 玉ねぎ: "1個" });

    await removeDish(store, dishId);
    expect(await shopping()).toEqual({});
    expect(store.meals.size).toBe(0);
  });

  it("同じ食事に品を足すと、同じ食事に並ぶ", async () => {
    await planCurry();
    await planCurry();
    expect(store.meals.size).toBe(1);
    expect(store.allDishes()).toHaveLength(2);
  });

  it("作る人数を指定して入れると、その人数分の材料が入る", async () => {
    await planCurry(today, 4);
    expect(await shopping()).toEqual({ 豚ばら肉: "400g", 玉ねぎ: "2個" });
  });

  it("存在しないレシピは献立に入れられない", async () => {
    await expect(
      planDish(store, { date: today, mealTime: "dinner", recipeId: "nope" }, newId),
    ).rejects.toThrow("レシピが見つかりません");
  });
});

describe("作る人数を変える", () => {
  it("買い物リストの分量も変わる", async () => {
    const dishId = await planCurry();
    await changeServings(store, dishId, 4);
    expect(await shopping()).toEqual({ 豚ばら肉: "400g", 玉ねぎ: "2個" });
  });

  it("残り物にしている品は、2 人分以下に減らせない", async () => {
    const dishId = await planCurry(today, 4);
    await addLeftover(store, { date: tomorrow, mealTime: "dinner", sourceDishId: dishId }, newId);
    await expect(changeServings(store, dishId, 2)).rejects.toThrow("先にその残り物を外してください");
    await expect(changeServings(store, dishId, 3)).resolves.toBeUndefined();
  });
});

describe("外食", () => {
  it("外食にすると品が外れて材料が消え、やめると食事ごと消える", async () => {
    await planCurry();
    await markEatingOut(store, { date: today, mealTime: "dinner" }, newId);
    expect(store.allDishes()).toHaveLength(0);
    expect(await shopping()).toEqual({});
    expect([...store.meals.values()][0].eatingOut).toBe(true);

    await cancelEatingOut(store, { date: today, mealTime: "dinner" });
    expect(store.meals.size).toBe(0);
  });

  it("何も決めていない食事も外食にできる", async () => {
    await markEatingOut(store, { date: tomorrow, mealTime: "lunch" }, newId);
    expect([...store.meals.values()]).toMatchObject([{ date: tomorrow, mealTime: "lunch", eatingOut: true }]);
  });
});

describe("残り物", () => {
  it("多めに作った品を翌日の献立に入れても、買い物は増えない", async () => {
    const dishId = await planCurry(today, 4);
    const before = await shopping();
    await addLeftover(store, { date: tomorrow, mealTime: "dinner", sourceDishId: dishId }, newId);
    expect(await shopping()).toEqual(before);
    const next = [...store.meals.values()].find((m) => m.date === tomorrow)!;
    expect(next.leftovers).toEqual([{ sourceDishId: dishId, recipeId: "curry" }]);
  });

  it("元の品を外すと、残り物も外れる", async () => {
    const dishId = await planCurry(today, 4);
    await addLeftover(store, { date: tomorrow, mealTime: "dinner", sourceDishId: dishId }, newId);
    await removeDish(store, dishId);
    expect(store.meals.size).toBe(0);
  });

  it("残り物を外せる", async () => {
    const dishId = await planCurry(today, 4);
    await addLeftover(store, { date: tomorrow, mealTime: "lunch", sourceDishId: dishId }, newId);
    await removeLeftover(store, { date: tomorrow, mealTime: "lunch", sourceDishId: dishId });
    expect([...store.meals.values()].map((m) => m.date)).toEqual([today]);
  });
});

describe("レシピの削除", () => {
  it("今日以降の献立で使っている日が分かる", async () => {
    await planCurry(calendarDate("2026-10-07"));
    await planCurry(tomorrow);
    expect(await upcomingUsesOfRecipe(store, "curry", today)).toEqual([{ date: tomorrow, mealTime: "dinner" }]);
  });

  it("削除すると、献立からも買い物リストからも消える。手で足した物は残る", async () => {
    const dishId = await planCurry(today, 4);
    await addLeftover(store, { date: tomorrow, mealTime: "dinner", sourceDishId: dishId }, newId);
    await addShoppingItem(store, { food: "牛乳" });

    await deleteRecipe(store, "curry");
    expect(store.meals.size).toBe(0);
    expect(store.recipes.has("curry")).toBe(false);
    expect(Object.keys(await shopping())).toEqual(["牛乳"]);
  });
});

describe("買い物リストを開く", () => {
  it("初回だけ、今日以降の献立の材料を作る人数に合わせて入れる", async () => {
    await planCurry(calendarDate("2026-10-07"));
    await planCurry(tomorrow, 4);
    store.items.clear();
    store.backfilled = false;

    expect(await shopping()).toEqual({ 豚ばら肉: "400g", 玉ねぎ: "2個" });
    expect(store.backfilled).toBe(true);

    // 2 回目は入れ直さない（手で消した物が復活しない）
    await removeShoppingItems(store, [...store.items.keys()]);
    expect(await shopping()).toEqual({});
  });

  it("前日までに買った物は消える", async () => {
    const milk = await addShoppingItem(store, { food: "牛乳" });
    await markBought(store, [milk.id], calendarDate("2026-10-07"));
    expect(await shopping()).toEqual({});
  });

  it("相手がもう消した買う物にチェックしても、エラーにならない", async () => {
    const milk = await addShoppingItem(store, { food: "牛乳" });
    await removeShoppingItems(store, [milk.id]);
    await expect(markBought(store, [milk.id], today)).resolves.toBeUndefined();
  });
});
