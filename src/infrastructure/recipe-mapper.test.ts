import { describe, expect, it } from "vitest";
import { Quantity } from "@/domain/recipe/quantity";
import type { RecipeDraft } from "@/lib/types";
import { normalizeIngredientRows, recipeFromDraft, toDomainRecipe, toRecipeRow } from "./recipe-mapper";

describe("DB の行からレシピを作る", () => {
  it("新しい形式: 人数は数値、材料は食材・分量・下ごしらえ", () => {
    const r = toDomainRecipe({
      id: "r1",
      title: "生姜焼き",
      servings: 1,
      ingredients: [{ name: "豚ロース肉", amount: "150g", preparation: "薄切り" }],
    });
    expect(r.servings).toEqual({ count: 1, assumed: false });
    expect(r.ingredients[0].food.name).toBe("豚ロース肉");
    expect(r.ingredients[0].preparation).toBe("薄切り");
    expect(Quantity.format(r.ingredientsFor(2)[0].quantity)).toBe("300g");
  });

  it("人数が null なら 2 人分とみなす", () => {
    const r = toDomainRecipe({ id: "r1", title: "炒め物", servings: null, ingredients: [] });
    expect(r.servings).toEqual({ count: 2, assumed: true });
  });

  it("古い形式も読める: 人数は文字列、下ごしらえは食材名に混ざっている", () => {
    const r = toDomainRecipe({
      id: "r1",
      title: "パスタ",
      servings: "材料(1人前)" as unknown as number,
      ingredients: [{ name: "ニンニク(微塵切り)", amount: "1片" }],
    });
    expect(r.servings.count).toBe(1);
    expect(r.ingredients[0].food.name).toBe("ニンニク");
    expect(r.ingredients[0].preparation).toBe("微塵切り");
  });
});

describe("編集画面に出す材料", () => {
  it("古い形式は食材と下ごしらえに分け、新しい形式はそのまま", () => {
    expect(
      normalizeIngredientRows([
        { name: "ニンニク(微塵切り)", amount: "1片" },
        { name: "豚肉（ロース）", amount: "300g" },
        { name: "塩", amount: "少々", preparation: "" },
      ]),
    ).toEqual([
      { name: "ニンニク", amount: "1片", preparation: "微塵切り" },
      { name: "豚肉（ロース）", amount: "300g", preparation: "" },
      { name: "塩", amount: "少々", preparation: "" },
    ]);
  });
});

describe("編集画面の入力を保存する形にする", () => {
  const draft: RecipeDraft = {
    title: " 生姜焼き ",
    source_url: "https://example.com/shogayaki",
    source_type: "web",
    image_url: null,
    servings: null,
    cook_time: "15分",
    description: null,
    ingredients: [
      { name: "豚ロース肉", amount: "0.5パック", preparation: "薄切り" },
      { name: "", amount: "", preparation: "" },
    ],
    steps: ["焼く", ""],
    tags: ["和食", "和食"],
    memo: null,
  };

  it("ルールに沿って整え、分量の表記と「記載なし」の人数はそのまま保存する", () => {
    const row = toRecipeRow(recipeFromDraft("r1", draft));
    expect(row).toMatchObject({
      title: "生姜焼き",
      servings: null,
      ingredients: [{ name: "豚ロース肉", amount: "0.5パック", preparation: "薄切り" }],
      steps: ["焼く"],
      tags: ["和食"],
      source_type: "web",
      source_url: "https://example.com/shogayaki",
    });
  });

  it("料理名が空なら保存できない", () => {
    expect(() => recipeFromDraft("r1", { ...draft, title: " " })).toThrow("料理名を入力してください");
  });

  it("出典の URL が http(s) でなければ保存できない", () => {
    expect(() => recipeFromDraft("r1", { ...draft, source_url: "javascript:alert(1)" })).toThrow("http:// か https://");
  });

  it("保存済みのデータに不正な URL があっても、読み込みは失敗しない", () => {
    const r = toDomainRecipe({ id: "r1", title: "古いレシピ", servings: 2, ingredients: [], source_type: "web", source_url: "ftp://x" });
    expect(r.content.source).toEqual({ kind: "web", url: null });
  });
});
