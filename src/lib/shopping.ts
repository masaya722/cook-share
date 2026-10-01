import type { Ingredient } from "./types";

export type ShoppingItem = {
  name: string;
  /** 合算した分量。単位が揃わないものは「＋」でつなぐ */
  amount: string;
  /** どのレシピで使うか */
  recipes: string[];
};

// 「大さじ2」「200g」「1/2個」「1.5カップ」のような分量を 接頭辞・数値・接尾辞 に分ける
const AMOUNT_PATTERN = /^(\D*?)\s*(\d+(?:\.\d+)?(?:\/\d+)?)\s*(\D*)$/;

type ParsedAmount = { unit: string; value: number };

function toHalfWidth(s: string): string {
  return s
    .replace(/[０-９．／]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[½]/g, "1/2")
    .replace(/[¼]/g, "1/4")
    .replace(/[¾]/g, "3/4");
}

export function parseAmount(raw: string): ParsedAmount | null {
  const m = AMOUNT_PATTERN.exec(toHalfWidth(raw.trim()));
  if (!m) return null;
  const [, prefix, num, suffix] = m;
  const value = num.includes("/")
    ? Number(num.split("/")[0]) / Number(num.split("/")[1])
    : Number(num);
  if (!Number.isFinite(value)) return null;
  return { unit: `${prefix.trim()}\u0000${suffix.trim()}`, value };
}

function formatAmount({ unit, value }: ParsedAmount): string {
  const [prefix, suffix] = unit.split("\u0000");
  const rounded = Math.round(value * 100) / 100;
  return `${prefix}${rounded}${suffix}`;
}

/** 材料名の表記ゆれを吸収するキー（空白・括弧書きを除く） */
export function ingredientKey(name: string): string {
  return toHalfWidth(name)
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function aggregateIngredients(
  entries: { recipeTitle: string; ingredients: Ingredient[] }[],
): ShoppingItem[] {
  const groups = new Map<
    string,
    { name: string; parsed: Map<string, number>; loose: string[]; recipes: Set<string> }
  >();

  for (const { recipeTitle, ingredients } of entries) {
    for (const ing of ingredients) {
      const key = ingredientKey(ing.name);
      if (!key) continue;
      let g = groups.get(key);
      if (!g) {
        g = { name: ing.name.trim(), parsed: new Map(), loose: [], recipes: new Set() };
        groups.set(key, g);
      }
      g.recipes.add(recipeTitle);

      const amount = ing.amount?.trim() ?? "";
      if (!amount) continue;
      const parsed = parseAmount(amount);
      if (parsed) {
        g.parsed.set(parsed.unit, (g.parsed.get(parsed.unit) ?? 0) + parsed.value);
      } else if (!g.loose.includes(amount)) {
        g.loose.push(amount);
      }
    }
  }

  return [...groups.values()].map((g) => ({
    name: g.name,
    amount: [
      ...[...g.parsed.entries()].map(([unit, value]) => formatAmount({ unit, value })),
      ...g.loose,
    ].join(" ＋ "),
    recipes: [...g.recipes],
  }));
}
