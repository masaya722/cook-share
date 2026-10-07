import { Food } from "./food";
import { Quantity } from "./quantity";

/** 材料: レシピに書かれた「食材＋分量＋下ごしらえ」 */
export type Ingredient = {
  readonly food: Food;
  readonly quantity: Quantity;
  /** みじん切り・薄切りなど。買う物には影響しない */
  readonly preparation: string;
};

// 括弧書きのうち、買った後の扱いを表す言葉。これ以外（ロース、ばら、薄力 など）は食材の一部とみなす
const PREPARATION_WORDS =
  /切り|切る|みじん|微塵|すりおろ|おろし|刻|ほぐ|ちぎ|つぶ|潰|むい|剥|除|取る|取った|下茹|茹で|戻し|戻す|溶き|溶い|室温|常温|水切り|お好み|好みで|あれば|なくても|なければ|飾り|仕上げ|トッピング/;

export const Ingredient = {
  of(food: string, quantity: string, preparation = ""): Ingredient {
    return { food: Food.of(food), quantity: Quantity.parse(quantity), preparation: preparation.trim() };
  },

  /**
   * 食材と下ごしらえが分かれていない名前（「ニンニク(微塵切り)」「豚肉（ロース）」）を分ける。
   * 括弧書きが下ごしらえなら食材から外し、部位や種類なら食材に残す。
   */
  fromName(name: string, quantity: string): Ingredient {
    const preparations: string[] = [];
    const food = name
      .replace(/[（(]([^）)]*)[）)]/g, (whole, inner: string) => {
        if (PREPARATION_WORDS.test(inner)) {
          preparations.push(inner.trim());
          return "";
        }
        return whole;
      })
      .trim();
    return Ingredient.of(food || name, quantity, preparations.join("、"));
  },

  scale(ingredient: Ingredient, factor: number): Ingredient {
    return { ...ingredient, quantity: Quantity.scale(ingredient.quantity, factor) };
  },
};
