import { beforeEach, describe, expect, it } from "vitest";
import { Meal } from "../menu/meal";
import { Ingredient } from "../recipe/ingredient";
import { Recipe, type RecipeId } from "../recipe/recipe";
import { Servings } from "../recipe/servings";
import { calendarDate } from "../shared/calendar-date";
import { applyMenuEvents } from "./menu-policy";
import { type ShoppingItemId, ShoppingList, type ShoppingRow } from "./shopping-list";
import { parseLine, parseLines } from "./shopping-line";

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

/** 画面に出る行（まだ買っていない物 → 買った物の順。区切りは除く） */
function rowsOf(list: ShoppingList, withinDays?: number): ShoppingRow[] {
  const view = list.view({ today, withinDays });
  return [...view.todo.filter((e): e is ShoppingRow => e.kind === "row"), ...view.bought];
}

function row(list: ShoppingList, name: string) {
  return rowsOf(list).find((r) => r.name === name);
}

/** まだ買っていない物と区切りを、画面の順に「名前」と「---」で並べる */
function todoLines(list: ShoppingList) {
  return list.view({ today }).todo.map((e) => (e.kind === "divider" ? "---" : e.name));
}

describe("献立と買い物リストの連動", () => {
  let list: ShoppingList;
  beforeEach(() => {
    list = newList();
  });

  it("献立を決めたら、材料が自動で買い物リストに入る", () => {
    planDish(list, "2026-10-08", "curry", "d1");
    // 献立の材料は、レシピに書かれた順に末尾へ入る
    expect(rowsOf(list).map((r) => r.name)).toEqual(["豚ばら肉", "玉ねぎ", "塩"]);
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
    expect(rowsOf(list)).toHaveLength(0);
  });

  it("残り物は買い物を増やさない", () => {
    const meal = planDish(list, "2026-10-08", "curry", "d1");
    meal.changeServings(meal.dishes[0].id, 4);
    applyMenuEvents(list, meal.pullEvents(), recipeOf);
    const before = rowsOf(list);

    const next = Meal.plan("m-next", day("2026-10-09"), "dinner");
    next.addLeftover({ ...meal.dishes[0], date: meal.date, mealTime: meal.mealTime });
    applyMenuEvents(list, next.pullEvents(), recipeOf);
    expect(rowsOf(list)).toEqual(before);
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
    const onions = rowsOf(list).filter((r) => r.name === "玉ねぎ");
    expect(onions).toHaveLength(1);
    expect(onions[0].bought).toBe(true);
  });

  it("使う日で絞り込める。手で足した物は常に出る", () => {
    const list = newList();
    planDish(list, "2026-10-08", "curry", "d1");
    planDish(list, "2026-10-12", "shogayaki", "d2");
    list.addManual({ name: "牛乳" });
    const names = rowsOf(list, 3).map((r) => r.name);
    expect(names).toContain("豚ばら肉");
    expect(names).toContain("牛乳");
    expect(names).not.toContain("豚ロース肉");
  });

  it("書いた順に並び、買った物は下にまとまる", () => {
    const list = newList();
    planDish(list, "2026-10-10", "shogayaki", "d2");
    planDish(list, "2026-10-08", "curry", "d1");
    list.addManual({ name: "牛乳" });
    list.markBought(row(list, "塩")!.itemIds, today);
    expect(todoLines(list)).toEqual(["豚ロース肉", "玉ねぎ", "豚ばら肉", "牛乳"]);
    expect(rowsOf(list).at(-1)).toMatchObject({ name: "塩", bought: true });
  });
});

describe("買い出し", () => {
  it("買った物は取り消し線で残り、翌日に消える", () => {
    const list = newList();
    const milk = list.addManual({ name: "牛乳" });
    list.markBought([milk.id], today);
    list.purgeBought(today);
    expect(row(list, "牛乳")?.bought).toBe(true);

    list.purgeBought(day("2026-10-09"));
    expect(list.all()).toHaveLength(0);
  });

  it("押し間違えたら当日中は戻せる", () => {
    const list = newList();
    const milk = list.addManual({ name: "牛乳" });
    list.markBought([milk.id], today);
    list.unmarkBought([milk.id]);
    expect(row(list, "牛乳")?.bought).toBe(false);
  });

  it("買えなかった物は残り続ける", () => {
    const list = newList();
    list.addManual({ name: "牛乳" });
    list.purgeBought(day("2026-10-20"));
    expect(row(list, "牛乳")?.bought).toBe(false);
  });

  it("冷蔵庫に合わせて、豚肉を消して鶏肉を足せる", () => {
    const list = newList();
    planDish(list, "2026-10-08", "curry", "d1");
    list.remove(row(list, "豚ばら肉")!.itemIds);
    list.addManual({ name: "鶏もも肉", quantity: "250g", neededOn: day("2026-10-08") });
    expect(row(list, "豚ばら肉")).toBeUndefined();
    expect(row(list, "鶏もも肉")?.quantityText).toBe("250g");
  });

  it("保存が必要な変更を取り出せる", () => {
    const list = newList();
    const milk = list.addManual({ name: "牛乳" });
    list.pullChanges();
    list.markBought([milk.id], today);
    const bread = list.addManual({ name: "食パン" });
    list.remove([bread.id]);
    const changes = list.pullChanges();
    expect(changes.upserted.map((i) => (i.kind === "item" ? i.name.text : "---"))).toEqual(["牛乳"]);
    expect(changes.removedIds).toEqual([bread.id]);
  });
});

describe("メモ帳のように書く", () => {
  it("1 行を品名と分量に分ける。分量のない物や、メーカー名入りの物は全体が品名", () => {
    expect(parseLine("牛乳 2本")).toEqual({ name: "牛乳", quantity: "2本" });
    expect(parseLine("・豚こま　300g")).toEqual({ name: "豚こま", quantity: "300g" });
    expect(parseLine("塩 少々")).toEqual({ name: "塩", quantity: "少々" });
    expect(parseLine("李錦記 オイスターソース")).toEqual({ name: "李錦記 オイスターソース", quantity: "" });
    expect(parseLine("B5バインダー")).toEqual({ name: "B5バインダー", quantity: "" });
    expect(parseLine("  ")).toBeNull();
  });

  it("メモ帳から貼り付けると、1 行ずつ買う物になり、空行と絵文字の見出しは区切りになる", () => {
    const text = "🛒\n・牛肉\n・鶏もも肉\n・卵\n\n\n・李錦記オイスターソース\n\n💊\n・マグネシウムサプリ\n・靴洗剤\n";
    expect(parseLines(text)).toEqual([
      { kind: "item", name: "牛肉", quantity: "" },
      { kind: "item", name: "鶏もも肉", quantity: "" },
      { kind: "item", name: "卵", quantity: "" },
      { kind: "divider" },
      { kind: "item", name: "李錦記オイスターソース", quantity: "" },
      { kind: "divider" },
      { kind: "item", name: "マグネシウムサプリ", quantity: "" },
      { kind: "item", name: "靴洗剤", quantity: "" },
    ]);
  });

  it("改行が \\n 以外の文字で届いても 1 行ずつ分ける（iPhone のメモ帳など）", () => {
    expect(parseLines("牛肉\u2028卵\r靴洗剤\r\n\u2029筆箱").map((l) => (l.kind === "item" ? l.name : "---"))).toEqual([
      "牛肉",
      "卵",
      "靴洗剤",
      "---",
      "筆箱",
    ]);
  });

  it("食材と日用品を同じリストに書ける", () => {
    const list = newList();
    list.write("牛乳 2本\n\n靴ブラシ");
    expect(todoLines(list)).toEqual(["牛乳", "---", "靴ブラシ"]);
    expect(row(list, "牛乳")?.quantityText).toBe("2本");
    expect(row(list, "靴ブラシ")?.quantityText).toBe("");
  });

  it("手で書いた物と献立の材料が同じ品名なら 1 行にまとまる", () => {
    const list = newList();
    list.write("玉ねぎ");
    planDish(list, "2026-10-08", "curry", "d1");
    expect(row(list, "玉ねぎ")).toMatchObject({ quantityText: "1個", recipeTitles: ["カレー"], editable: false });
  });
});

describe("書いた物を直す", () => {
  it("1 行の文章として直せる", () => {
    const list = newList();
    const [milk] = list.write("牛乳");
    list.edit(milk.id, "牛乳 2本");
    expect(row(list, "牛乳")).toMatchObject({ quantityText: "2本", editText: "牛乳 2本" });
  });

  it("献立から来た材料も、品名を変えられる（豚ばら肉 → 豚こま）", () => {
    const list = newList();
    planDish(list, "2026-10-08", "curry", "d1");
    list.edit(row(list, "豚ばら肉")!.itemIds[0], "豚こま 300g");
    expect(row(list, "豚こま")).toMatchObject({ quantityText: "300g", recipeTitles: ["カレー"] });
  });

  it("分量が「少々」の物は、そのまま保存しても品名が変わらない", () => {
    const list = newList();
    planDish(list, "2026-10-08", "curry", "d1");
    const salt = row(list, "塩")!;
    list.edit(salt.itemIds[0], salt.editText);
    expect(row(list, "塩")?.quantityText).toBe("少々");
  });

  it("品名を空にはできない", () => {
    const list = newList();
    const [milk] = list.write("牛乳");
    expect(() => list.edit(milk.id, " ")).toThrow("品名を入力してください");
  });
});

describe("区切りと並べ替え", () => {
  function shoppingNotes() {
    const list = newList();
    list.write("牛肉\n卵\n筆箱\n靴洗剤");
    const ids = Object.fromEntries(list.items().map((i) => [i.name.text, i.id])) as Record<string, ShoppingItemId>;
    return { list, ids };
  }

  it("書いた後で、別の行の手前に動かせる", () => {
    const { list, ids } = shoppingNotes();
    list.moveBefore([ids["靴洗剤"]], ids["筆箱"]);
    expect(todoLines(list)).toEqual(["牛肉", "卵", "靴洗剤", "筆箱"]);
    list.moveBefore([ids["牛肉"]], null);
    expect(todoLines(list)).toEqual(["卵", "靴洗剤", "筆箱", "牛肉"]);
  });

  it("区切りを足して、その手前に動かして振り分けられる", () => {
    const { list, ids } = shoppingNotes();
    const divider = list.addDivider();
    list.moveBefore([divider.id], ids["筆箱"]);
    expect(todoLines(list)).toEqual(["牛肉", "卵", "---", "筆箱", "靴洗剤"]);
  });

  it("動かした物だけ保存すればよい", () => {
    const { list, ids } = shoppingNotes();
    list.pullChanges();
    list.moveBefore([ids["靴洗剤"]], ids["牛肉"]);
    expect(list.pullChanges().upserted.map((e) => e.id)).toEqual([ids["靴洗剤"]]);
  });

  it("何度も間に入れても並び順が崩れない", () => {
    const { list, ids } = shoppingNotes();
    for (let i = 0; i < 60; i++) {
      list.moveBefore([ids["靴洗剤"]], ids["卵"]);
      list.moveBefore([ids["筆箱"]], ids["靴洗剤"]);
    }
    expect(todoLines(list)).toEqual(["牛肉", "筆箱", "靴洗剤", "卵"]);
  });

  it("絞り込みで行が消えても、区切りが並んだり端に残ったりしない", () => {
    const list = newList();
    list.write("牛乳\n\n");
    list.addDivider();
    planDish(list, "2026-10-20", "curry", "d1");
    expect(list.view({ today, withinDays: 1 }).todo.map((e) => e.kind)).toEqual(["row"]);
  });

  it("買った物を戻すと、元の場所に戻る", () => {
    const { list, ids } = shoppingNotes();
    list.markBought([ids["卵"]], today);
    expect(todoLines(list)).toEqual(["牛肉", "筆箱", "靴洗剤"]);
    list.unmarkBought([ids["卵"]]);
    expect(todoLines(list)).toEqual(["牛肉", "卵", "筆箱", "靴洗剤"]);
  });
});
