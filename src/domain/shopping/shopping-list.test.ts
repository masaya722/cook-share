import { beforeEach, describe, expect, it } from "vitest";
import { Meal } from "../menu/meal";
import { Ingredient } from "../recipe/ingredient";
import { Recipe, type RecipeId } from "../recipe/recipe";
import { Servings } from "../recipe/servings";
import { calendarDate } from "../shared/calendar-date";
import { applyMenuEvents } from "./menu-policy";
import { ShoppingList } from "./shopping-list";

const day = (d: string) => calendarDate(d);
const today = day("2026-10-08");

const recipes = new Map<string, Recipe>([
  [
    "curry",
    Recipe.create({
      id: "curry",
      title: "カレー",
      servings: Servings.of(2),
      ingredients: [
        Ingredient.of("豚ばら肉", "200g"),
        Ingredient.of("玉ねぎ", "1個"),
        Ingredient.of("塩", "少々"),
      ],
    }),
  ],
  [
    "shogayaki",
    Recipe.create({
      id: "shogayaki",
      title: "生姜焼き",
      servings: Servings.of(2),
      ingredients: [
        Ingredient.of("豚ロース肉", "300g"),
        Ingredient.of("玉ねぎ", "1/2個"),
        Ingredient.of("塩", "少々"),
      ],
    }),
  ],
]);
const recipeOf = (id: RecipeId) => recipes.get(id)!;

let seq = 0;
const newList = () => ShoppingList.reconstitute([], () => `item-${++seq}`);

/** 献立に品を加え、ポリシーで買い物リストに反映する */
function planDish(list: ShoppingList, date: string, recipe: string, dishId: string) {
  const meal = Meal.plan(`meal-${dishId}`, day(date), "dinner");
  meal.addDish(dishId, recipe as RecipeId);
  applyMenuEvents(list, meal.pullEvents(), recipeOf);
  return meal;
}

function row(list: ShoppingList, food: string) {
  return list.rows({ today }).find((r) => r.foodName === food);
}

describe("献立と買い物リストの連動", () => {
  let list: ShoppingList;
  beforeEach(() => {
    list = newList();
  });

  it("献立を決めたら、材料が自動で買い物リストに入る", () => {
    planDish(list, "2026-10-08", "curry", "d1");
    expect(list.rows({ today }).map((r) => r.foodName)).toEqual(["塩", "玉ねぎ", "豚ばら肉"]);
    expect(row(list, "豚ばら肉")).toMatchObject({ quantityText: "200g", recipeTitles: ["カレー"], neededOn: "2026-10-08" });
  });

  it("献立を取りやめたら、その品の材料が自動で消える", () => {
    const meal = planDish(list, "2026-10-08", "curry", "d1");
    planDish(list, "2026-10-09", "shogayaki", "d2");
    meal.removeDish(meal.dishes[0].id);
    applyMenuEvents(list, meal.pullEvents(), recipeOf);
    expect(row(list, "豚ばら肉")).toBeUndefined();
    expect(row(list, "玉ねぎ")).toMatchObject({ quantityText: "1/2個", recipeTitles: ["生姜焼き"] });
  });

  it("取りやめても、もう買った物は消えない", () => {
    const meal = planDish(list, "2026-10-08", "curry", "d1");
    list.markBought(row(list, "豚ばら肉")!.itemIds, today);
    meal.removeDish(meal.dishes[0].id);
    applyMenuEvents(list, meal.pullEvents(), recipeOf);
    expect(row(list, "豚ばら肉")).toMatchObject({ bought: true });
    expect(row(list, "玉ねぎ")).toBeUndefined();
  });

  it("作る人数を倍にしたら、買い物リストの分量も倍になる", () => {
    const meal = planDish(list, "2026-10-08", "curry", "d1");
    meal.changeServings(meal.dishes[0].id, 4);
    applyMenuEvents(list, meal.pullEvents(), recipeOf);
    expect(row(list, "豚ばら肉")?.quantityText).toBe("400g");
    expect(row(list, "塩")?.quantityText).toBe("少々");
  });

  it("手で消した物は、作る人数を変えても消えたまま", () => {
    const meal = planDish(list, "2026-10-08", "curry", "d1");
    list.remove(row(list, "玉ねぎ")!.itemIds);
    meal.changeServings(meal.dishes[0].id, 4);
    applyMenuEvents(list, meal.pullEvents(), recipeOf);
    expect(row(list, "玉ねぎ")).toBeUndefined();
  });

  it("外食にしたら、その食事の材料が消える", () => {
    const meal = planDish(list, "2026-10-08", "curry", "d1");
    meal.markEatingOut();
    applyMenuEvents(list, meal.pullEvents(), recipeOf);
    expect(list.rows({ today })).toHaveLength(0);
  });

  it("残り物は買い物を増やさない", () => {
    const meal = planDish(list, "2026-10-08", "curry", "d1");
    meal.changeServings(meal.dishes[0].id, 4);
    applyMenuEvents(list, meal.pullEvents(), recipeOf);
    const before = list.rows({ today });

    const next = Meal.plan("m-next", day("2026-10-09"), "dinner");
    next.addLeftover({ ...meal.dishes[0], date: meal.date, mealTime: meal.mealTime });
    applyMenuEvents(list, next.pullEvents(), recipeOf);
    expect(list.rows({ today })).toEqual(before);
  });
});

describe("買い物リストの表示", () => {
  it("同じ食材は合算して 1 行にし、どのレシピで使うかを添える", () => {
    const list = newList();
    planDish(list, "2026-10-08", "curry", "d1");
    planDish(list, "2026-10-09", "shogayaki", "d2");
    expect(row(list, "玉ねぎ")).toMatchObject({
      quantityText: "1と1/2個",
      recipeTitles: ["カレー", "生姜焼き"],
      neededOn: "2026-10-08",
    });
    expect(row(list, "塩")?.quantityText).toBe("少々");
  });

  it("部位が違う食材は合算しない（豚ばら肉と豚ロース肉）", () => {
    const list = newList();
    planDish(list, "2026-10-08", "curry", "d1");
    planDish(list, "2026-10-09", "shogayaki", "d2");
    expect(row(list, "豚ばら肉")?.quantityText).toBe("200g");
    expect(row(list, "豚ロース肉")?.quantityText).toBe("300g");
  });

  it("合算した行のチェックは、まとめた買う物すべてに効く", () => {
    const list = newList();
    planDish(list, "2026-10-08", "curry", "d1");
    planDish(list, "2026-10-09", "shogayaki", "d2");
    list.markBought(row(list, "玉ねぎ")!.itemIds, today);
    const onions = list.rows({ today }).filter((r) => r.foodName === "玉ねぎ");
    expect(onions).toHaveLength(1);
    expect(onions[0].bought).toBe(true);
  });

  it("使う日で絞り込める。手で足した物は常に出る", () => {
    const list = newList();
    planDish(list, "2026-10-08", "curry", "d1");
    planDish(list, "2026-10-12", "shogayaki", "d2");
    list.addManual({ food: "牛乳" });
    const names = list.rows({ today, withinDays: 3 }).map((r) => r.foodName);
    expect(names).toContain("豚ばら肉");
    expect(names).toContain("牛乳");
    expect(names).not.toContain("豚ロース肉");
  });

  it("買っていない物が先、使う日が早い順に並ぶ", () => {
    const list = newList();
    planDish(list, "2026-10-10", "shogayaki", "d2");
    planDish(list, "2026-10-08", "curry", "d1");
    list.markBought(row(list, "塩")!.itemIds, today);
    const rows = list.rows({ today });
    expect(rows[0].neededOn).toBe("2026-10-08");
    expect(rows.at(-1)).toMatchObject({ foodName: "塩", bought: true });
  });
});

describe("買い出し", () => {
  it("買った物は取り消し線で残り、翌日に消える", () => {
    const list = newList();
    const milk = list.addManual({ food: "牛乳" });
    list.markBought([milk.id], today);
    list.purgeBought(today);
    expect(row(list, "牛乳")?.bought).toBe(true);

    list.purgeBought(day("2026-10-09"));
    expect(list.all()).toHaveLength(0);
  });

  it("押し間違えたら当日中は戻せる", () => {
    const list = newList();
    const milk = list.addManual({ food: "牛乳" });
    list.markBought([milk.id], today);
    list.unmarkBought([milk.id]);
    expect(row(list, "牛乳")?.bought).toBe(false);
  });

  it("買えなかった物は残り続ける", () => {
    const list = newList();
    list.addManual({ food: "牛乳" });
    list.purgeBought(day("2026-10-20"));
    expect(row(list, "牛乳")?.bought).toBe(false);
  });

  it("冷蔵庫に合わせて、豚肉を消して鶏肉を足せる", () => {
    const list = newList();
    planDish(list, "2026-10-08", "curry", "d1");
    list.remove(row(list, "豚ばら肉")!.itemIds);
    list.addManual({ food: "鶏もも肉", quantity: "250g", neededOn: day("2026-10-08") });
    expect(row(list, "豚ばら肉")).toBeUndefined();
    expect(row(list, "鶏もも肉")?.quantityText).toBe("250g");
  });

  it("保存が必要な変更を取り出せる", () => {
    const list = newList();
    const milk = list.addManual({ food: "牛乳" });
    list.pullChanges();
    list.markBought([milk.id], today);
    const bread = list.addManual({ food: "食パン" });
    list.remove([bread.id]);
    const changes = list.pullChanges();
    expect(changes.upserted.map((i) => i.food.name)).toEqual(["牛乳"]);
    expect(changes.removedIds).toEqual([bread.id]);
  });
});
