import { beforeEach, describe, expect, it } from "vitest";
import { Ingredient } from "@/domain/recipe/ingredient";
import { Recipe } from "@/domain/recipe/recipe";
import { Servings } from "@/domain/recipe/servings";
import { calendarDate } from "@/domain/shared/calendar-date";
import { InMemoryStore } from "./in-memory-store";
import {
  addLeftover,
  cancelEatingOut,
  changeServings,
  deleteRecipe,
  markEatingOut,
  openShoppingMemo,
  planDish,
  reflectMenuIngredients,
  removeDish,
  removeLeftover,
  saveRecipe,
  saveShoppingMemoText,
  upcomingUsesOfRecipe,
} from "./use-cases";

const today = calendarDate("2026-10-26");
const tomorrow = calendarDate("2026-10-27");

let store: InMemoryStore;
let seq: number;
const newId = () => `id-${++seq}`;

beforeEach(() => {
  seq = 0;
  store = new InMemoryStore();
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

async function planCurry(date = today, servingsToCook?: number) {
  await planDish(store, { date, mealTime: "dinner", recipeId: "curry", servingsToCook }, newId);
  return store.allDishes().at(-1)!.id;
}

describe("品を献立に入れる・外す", () => {
  it("品を加えて外すと、空になった食事は残らない", async () => {
    const dishId = await planCurry();
    expect(store.meals.size).toBe(1);
    await removeDish(store, dishId);
    expect(store.meals.size).toBe(0);
  });

  it("同じ食事に品を足すと、同じ食事に並ぶ", async () => {
    await planCurry();
    await planCurry();
    expect(store.meals.size).toBe(1);
    expect(store.allDishes()).toHaveLength(2);
  });

  it("存在しないレシピは献立に入れられない", async () => {
    await expect(
      planDish(store, { date: today, mealTime: "dinner", recipeId: "nope" }, newId),
    ).rejects.toThrow("レシピが見つかりません");
  });

  it("献立を変えても、買い物メモは自動では変わらない", async () => {
    store.memo.text = "☐ 牛乳";
    const dishId = await planCurry();
    await removeDish(store, dishId);
    expect((await openShoppingMemo(store)).text).toBe("☐ 牛乳");
  });
});

describe("作る人数を変える", () => {
  it("残り物にしている品は、2 人分以下に減らせない", async () => {
    const dishId = await planCurry(today, 4);
    await addLeftover(store, { date: tomorrow, mealTime: "dinner", sourceDishId: dishId }, newId);
    await expect(changeServings(store, dishId, 2)).rejects.toThrow("先にその残り物を外してください");
    await expect(changeServings(store, dishId, 3)).resolves.toBeUndefined();
  });
});

describe("外食", () => {
  it("外食にすると品が外れ、やめると食事ごと消える", async () => {
    await planCurry();
    await markEatingOut(store, { date: today, mealTime: "dinner" }, newId);
    expect(store.allDishes()).toHaveLength(0);
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
  it("多めに作った品を翌日の献立に入れられる", async () => {
    const dishId = await planCurry(today, 4);
    await addLeftover(store, { date: tomorrow, mealTime: "dinner", sourceDishId: dishId }, newId);
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

describe("レシピ", () => {
  it("今日以降の献立で使っている日が分かる", async () => {
    await planCurry(calendarDate("2026-10-25"));
    await planCurry(tomorrow);
    expect(await upcomingUsesOfRecipe(store, "curry", today)).toEqual([{ date: tomorrow, mealTime: "dinner" }]);
  });

  it("削除すると、献立からも消える", async () => {
    const dishId = await planCurry(today, 4);
    await addLeftover(store, { date: tomorrow, mealTime: "dinner", sourceDishId: dishId }, newId);
    await deleteRecipe(store, "curry");
    expect(store.meals.size).toBe(0);
    expect(store.recipes.has("curry")).toBe(false);
  });

  it("新しいレシピを保存すると、献立に入れられる", async () => {
    await saveRecipe(
      store,
      Recipe.create({ id: "pasta", title: "パスタ", servings: Servings.of(1), ingredients: [Ingredient.of("パスタ", "100g")] }),
      "insert",
    );
    await planDish(store, { date: today, mealTime: "lunch", recipeId: "pasta" }, newId);
    expect(store.allDishes()).toHaveLength(1);
  });

  it("ないレシピは上書きできない", async () => {
    const r = Recipe.create({ id: "nope", title: "x", servings: Servings.assumed(), ingredients: [] });
    await expect(saveRecipe(store, r, "update")).rejects.toThrow();
  });
});

describe("買い物メモを保存する", () => {
  it("相手が保存していなければ、そのまま保存する", async () => {
    const opened = await openShoppingMemo(store);
    const { memo, merged } = await saveShoppingMemoText(store, {
      baseText: opened.text,
      baseVersion: opened.version,
      text: "☐ 牛乳\n安ければ2本",
    });
    expect(merged).toBe(false);
    expect(memo.text).toBe("☐ 牛乳\n安ければ2本");
    expect(memo.version).toBe(opened.version + 1);
  });

  it("相手が先に保存していたら、行単位でまとめて保存する（どちらの行も残る）", async () => {
    store.memo.text = "☐ 牛肉";
    const wife = await openShoppingMemo(store);
    const husband = await openShoppingMemo(store);

    await saveShoppingMemoText(store, { baseText: husband.text, baseVersion: husband.version, text: "☐ 牛肉\n☐ 靴洗剤" });
    const { memo, merged } = await saveShoppingMemoText(store, {
      baseText: wife.text,
      baseVersion: wife.version,
      text: "☐ 牛肉\n☐ 卵",
    });
    expect(merged).toBe(true);
    expect(memo.text.split("\n").sort()).toEqual(["☐ 卵", "☐ 牛肉", "☐ 靴洗剤"].sort());
  });
});

describe("献立の材料を反映する", () => {
  it("期間内の献立の材料を、作る人数に合わせてメモの末尾に足す", async () => {
    store.memo.text = "☐ 牛乳";
    await planCurry(today, 4);
    await planCurry(calendarDate("2026-11-05"));
    const memo = await reflectMenuIngredients(store, { from: today, to: tomorrow });
    expect(memo.text).toBe("☐ 牛乳\n\n【10/26(月)〜10/27(火)の献立の材料】\n☐ 豚ばら肉 400g\n☐ 玉ねぎ 2個");
  });

  it("2 回押しても二重に入らず、新しく足した献立の分だけ入る", async () => {
    await planCurry(today);
    await reflectMenuIngredients(store, { from: today, to: tomorrow });
    await expect(reflectMenuIngredients(store, { from: today, to: tomorrow })).rejects.toThrow(
      "まだ反映していない献立はありません",
    );
    await planCurry(tomorrow);
    const memo = await reflectMenuIngredients(store, { from: today, to: tomorrow });
    expect(memo.text.match(/【/g)).toHaveLength(2);
  });

  it("反映の途中で相手がメモを保存しても、相手の行は消えない", async () => {
    await planCurry(today);
    const original = store.saveShoppingMemo.bind(store);
    let first = true;
    store.saveShoppingMemo = async (memo, expected) => {
      if (first) {
        // 反映を保存する直前に、相手が保存した
        first = false;
        store.memo = { ...store.memo, text: "☐ 筆箱", version: store.memo.version + 1 };
      }
      return original(memo, expected);
    };
    const memo = await reflectMenuIngredients(store, { from: today, to: today });
    expect(memo.text.startsWith("☐ 筆箱\n\n【")).toBe(true);
  });
});
