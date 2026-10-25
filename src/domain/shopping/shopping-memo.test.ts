import { describe, expect, it } from "vitest";
import type { DishId } from "../menu/meal";
import { Ingredient } from "../recipe/ingredient";
import { Recipe } from "../recipe/recipe";
import { Servings } from "../recipe/servings";
import { calendarDate } from "../shared/calendar-date";
import { type DishToReflect, mergeMemoText, parseMemoLine, removeDoneLines, ShoppingMemo, toggleLine } from "./shopping-memo";

const day = (d: string) => calendarDate(d);

const curry = Recipe.create({
  id: "curry",
  title: "カレー",
  servings: Servings.of(2),
  ingredients: [Ingredient.of("豚ばら肉", "200g"), Ingredient.of("玉ねぎ", "1個"), Ingredient.of("塩", "少々")],
});
const soup = Recipe.create({
  id: "soup",
  title: "スープ",
  servings: Servings.of(2),
  ingredients: [Ingredient.of("玉ねぎ", "1/2個"), Ingredient.of("塩", "少々")],
});

const dish = (dishId: string, date: string, recipe: Recipe, servingsToCook = 2): DishToReflect => ({
  dishId: dishId as DishId,
  date: day(date),
  recipe,
  servingsToCook,
});

const memo = (text = "") => ShoppingMemo.reconstitute({ text, reflectedDishIds: [], version: 1 });

describe("メモの行", () => {
  it("☐・☑ で始まる行はチェックできる行、それ以外は見出しや一言メモ", () => {
    expect(parseMemoLine("☐ 牛乳 2本")).toEqual({ kind: "check", done: false, text: "牛乳 2本" });
    expect(parseMemoLine("☑ 卵")).toEqual({ kind: "check", done: true, text: "卵" });
    expect(parseMemoLine("🛒 スーパー")).toEqual({ kind: "text", text: "🛒 スーパー" });
  });

  it("チェックできる行だけ ☐ ↔ ☑ を切り替えられる", () => {
    const text = "🛒\n☐ 牛乳\n☑ 卵";
    expect(toggleLine(text, 1)).toBe("🛒\n☑ 牛乳\n☑ 卵");
    expect(toggleLine(text, 2)).toBe("🛒\n☐ 牛乳\n☐ 卵");
    expect(toggleLine(text, 0)).toBe(text);
  });

  it("買った行（☑）をまとめて消せる。見出しや一言メモは残る", () => {
    expect(removeDoneLines("🛒\n☑ 牛乳\n☐ 卵\n\n\n☑ 靴洗剤\n安ければ2個")).toBe("🛒\n☐ 卵\n\n安ければ2個");
  });
});

describe("献立の材料を反映する", () => {
  it("作る人数に合わせて合算し、見出しを付けて末尾に足す", () => {
    const result = memo("☐ 牛乳").reflect([dish("d1", "2026-10-26", curry, 4), dish("d2", "2026-10-27", soup)], {
      from: day("2026-10-26"),
      to: day("2026-10-28"),
    });
    expect(result.text).toBe(
      ["☐ 牛乳", "", "【10/26(月)〜10/28(水)の献立の材料】", "☐ 豚ばら肉 400g", "☐ 玉ねぎ 2と1/2個", "☐ 塩 少々"].join("\n"),
    );
  });

  it("1 日だけなら見出しの日付も 1 つ。メモが空なら見出しから始まる", () => {
    const result = memo().reflect([dish("d1", "2026-10-26", soup)], { from: day("2026-10-26"), to: day("2026-10-26") });
    expect(result.text.split("\n")[0]).toBe("【10/26(月)の献立の材料】");
  });

  it("反映した品は覚えておき、2 回目は入れない", () => {
    const range = { from: day("2026-10-26"), to: day("2026-10-28") };
    const once = memo().reflect([dish("d1", "2026-10-26", curry)], range);
    expect(once.isReflected("d1")).toBe(true);
    const twice = once.reflect([dish("d1", "2026-10-26", curry), dish("d2", "2026-10-27", soup)], range);
    expect(twice.text.match(/豚ばら肉/g)).toHaveLength(1);
    expect(twice.text).toContain("☐ 玉ねぎ 1/2個");
  });

  it("まだ反映していない献立がなければ、そう伝える", () => {
    const range = { from: day("2026-10-26"), to: day("2026-10-26") };
    const once = memo().reflect([dish("d1", "2026-10-26", curry)], range);
    expect(() => once.reflect([dish("d1", "2026-10-26", curry)], range)).toThrow("まだ反映していない献立はありません");
  });

  it("反映した後でメモを書き換えても、反映した品は覚えている", () => {
    const range = { from: day("2026-10-26"), to: day("2026-10-26") };
    const edited = memo().reflect([dish("d1", "2026-10-26", curry)], range).withText("全部消した");
    expect(edited.isReflected("d1")).toBe(true);
  });
});

describe("2 人の書き換えをまとめる", () => {
  const base = "☐ 牛肉\n☐ 卵";

  it("妻が牛乳を足している間に、夫が献立の材料を反映した → どちらも残る", () => {
    const server = `${base}\n\n【10/26(月)の献立の材料】\n☐ 玉ねぎ 1個`;
    const local = "☐ 牛肉\n☐ 卵\n☐ 牛乳";
    expect(mergeMemoText(base, server, local)).toBe("☐ 牛肉\n☐ 卵\n☐ 牛乳\n\n【10/26(月)の献立の材料】\n☐ 玉ねぎ 1個");
  });

  it("相手がチェックした行も、手元で足した行も残る", () => {
    const server = "☑ 牛肉\n☐ 卵";
    const local = "☐ 牛肉\n☐ 卵\n☐ 靴洗剤";
    expect(mergeMemoText(base, server, local)).toBe("☑ 牛肉\n☐ 卵\n☐ 靴洗剤");
  });

  it("手元でチェックした行は、相手の文章にも当てはめる", () => {
    const server = "☐ 牛肉\n☐ 卵\n☐ 筆箱";
    const local = "☐ 牛肉\n☑ 卵";
    expect(mergeMemoText(base, server, local)).toBe("☐ 牛肉\n☑ 卵\n☐ 筆箱");
  });

  it("手元で消した行は、相手の文章からも消える", () => {
    const server = "☐ 牛肉\n☐ 卵\n☐ 筆箱";
    const local = "☐ 卵";
    expect(mergeMemoText(base, server, local)).toBe("☐ 卵\n☐ 筆箱");
  });

  it("相手が何も変えていなければ、手元の文章そのまま", () => {
    const local = "🛒\n☐ 牛肉\n安いほう\n☐ 卵";
    expect(mergeMemoText(base, base, local)).toBe(local);
  });
});
