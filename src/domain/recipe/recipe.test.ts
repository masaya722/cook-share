import { describe, expect, it } from "vitest";
import { DomainError } from "../shared/domain-error";
import { Food } from "./food";
import { Ingredient } from "./ingredient";
import { Quantity } from "./quantity";
import { Recipe } from "./recipe";
import { Servings } from "./servings";

describe("食材", () => {
  it("部位や種類が違えば別の食材", () => {
    expect(Food.of("豚ばら肉").equals(Food.of("豚ロース肉"))).toBe(false);
    expect(Food.of("豚肉（ロース）").equals(Food.of("豚肉（ばら）"))).toBe(false);
  });

  it("部位が書かれていない食材と、部位が書かれた食材は別", () => {
    expect(Food.of("豚肉").equals(Food.of("豚ばら肉"))).toBe(false);
  });

  it("全角・半角や空白の違いは同じ食材", () => {
    expect(Food.of("豚肉（ロース）").equals(Food.of("豚肉(ロース)"))).toBe(true);
    expect(Food.of("ﾊﾟﾌﾟﾘｶ").equals(Food.of("パプリカ"))).toBe(true);
    expect(Food.of(" 玉ねぎ ").equals(Food.of("玉ねぎ"))).toBe(true);
  });

  it("空の食材名は作れない", () => {
    expect(() => Food.of("  ")).toThrow(DomainError);
  });
});

describe("分量", () => {
  it.each([
    ["大さじ2", "大さじ", 2, ""],
    ["200g", "", 200, "g"],
    ["1/2個", "", 0.5, "個"],
    ["大さじ1と1/2", "大さじ", 1.5, ""],
    ["２００ｍｌ", "", 200, "ml"],
  ])("%s は数えられる分量", (raw, prefix, value, suffix) => {
    expect(Quantity.parse(raw)).toEqual({ kind: "countable", prefix, value, suffix });
  });

  it.each(["少々", "適量", ""])("%s は数えられない分量", (raw) => {
    expect(Quantity.parse(raw).kind).toBe("uncountable");
  });

  it("人数に合わせて増減できる。数えられない分量はそのまま", () => {
    expect(Quantity.format(Quantity.scale(Quantity.parse("1/2個"), 2))).toBe("1個");
    expect(Quantity.format(Quantity.scale(Quantity.parse("大さじ1"), 1.5))).toBe("大さじ1と1/2");
    expect(Quantity.format(Quantity.scale(Quantity.parse("少々"), 2))).toBe("少々");
  });

  it("同じ単位どうしは合算できる", () => {
    const sum = Quantity.add(Quantity.parse("大さじ2"), Quantity.parse("大さじ1"));
    expect(Quantity.format(sum)).toBe("大さじ3");
  });

  it("単位が違えば合算できない", () => {
    expect(Quantity.canAdd(Quantity.parse("大さじ1"), Quantity.parse("小さじ1"))).toBe(false);
    expect(Quantity.canAdd(Quantity.parse("少々"), Quantity.parse("少々"))).toBe(false);
  });

  it("g や ml は整数で表示する", () => {
    expect(Quantity.format(Quantity.scale(Quantity.parse("150g"), 1.5))).toBe("225g");
  });
});

describe("基準人数", () => {
  it.each([
    ["2人分", 2],
    ["材料(1人前)", 1],
    ["２〜３人分", 2],
    ["4 人前", 4],
  ])("%s → %d 人分", (text, count) => {
    expect(Servings.parse(text)).toEqual({ count, assumed: false });
  });

  it("記載がなければ 2 人分とみなし、みなしであることが分かる", () => {
    expect(Servings.parse(null)).toEqual({ count: 2, assumed: true });
    expect(Servings.parse("たっぷり")).toEqual({ count: 2, assumed: true });
    expect(Servings.label(Servings.parse(null))).toBe("2人分（記載なし）");
  });
});

describe("材料", () => {
  it("括弧書きの下ごしらえは食材から分ける", () => {
    const i = Ingredient.fromName("ニンニク(微塵切り)", "1片");
    expect(i.food.name).toBe("ニンニク");
    expect(i.preparation).toBe("微塵切り");
  });

  it("括弧書きの部位や種類は食材に残す", () => {
    const i = Ingredient.fromName("豚肉（ロース）", "300g");
    expect(i.food.name).toBe("豚肉（ロース）");
    expect(i.preparation).toBe("");
  });

  it("下ごしらえと部位が両方あっても正しく分ける", () => {
    const i = Ingredient.fromName("牛肉（薄切り）", "80g");
    expect(i.food.name).toBe("牛肉");
    expect(i.preparation).toBe("薄切り");
  });
});

describe("レシピ", () => {
  const curry = () =>
    Recipe.create({
      id: "r1",
      title: "カレー",
      servings: Servings.of(2),
      ingredients: [Ingredient.of("玉ねぎ", "1個"), Ingredient.of("塩", "少々")],
    });

  it("料理名は必須", () => {
    expect(() =>
      Recipe.create({ id: "r1", title: " ", servings: Servings.assumed(), ingredients: [] }),
    ).toThrow("料理名を入力してください");
  });

  it("作る人数に合わせて材料を増減する", () => {
    const scaled = curry().ingredientsFor(4);
    expect(scaled.map((i) => Quantity.format(i.quantity))).toEqual(["2個", "少々"]);
  });

  it("1 人前のレシピを 2 人分作るときは倍になる", () => {
    const r = Recipe.create({
      id: "r2",
      title: "パスタ",
      servings: Servings.parse("材料(1人前)"),
      ingredients: [Ingredient.of("パスタ", "100g")],
    });
    expect(Quantity.format(r.ingredientsFor(2)[0].quantity)).toBe("200g");
  });
});
