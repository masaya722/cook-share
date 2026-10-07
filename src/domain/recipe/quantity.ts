/**
 * 分量。
 * - 数えられる分量（大さじ2、200g、1/2個、大さじ1と1/2）は人数に合わせて増減でき、同じ単位どうしは合算できる
 * - 数えられない分量（少々、適量）は増減も合算もしない
 */
export type Quantity = CountableQuantity | UncountableQuantity;

type CountableQuantity = {
  readonly kind: "countable";
  readonly value: number;
  /** 数字の前に付く単位（「大さじ」など） */
  readonly prefix: string;
  /** 数字の後に付く単位（「g」「個」など） */
  readonly suffix: string;
};

type UncountableQuantity = {
  readonly kind: "uncountable";
  /** 「少々」「適量」など。空文字は分量の記載なし */
  readonly text: string;
};

const NUMBER = String.raw`\d+(?:\.\d+)?(?:\s*と\s*\d+\s*\/\s*\d+|\s*\/\s*\d+)?`;
const COUNTABLE_PATTERN = new RegExp(`^(\\D*?)\\s*(${NUMBER})\\s*(\\D*)$`);

function parseNumber(text: string): number | null {
  // 「1と1/2」
  const mixed = /^(\d+)\s*と\s*(\d+)\s*\/\s*(\d+)$/.exec(text);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+)$/.exec(text);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export const Quantity = {
  parse(raw: string): Quantity {
    const text = raw.normalize("NFKC").trim();
    const m = COUNTABLE_PATTERN.exec(text);
    if (m) {
      const value = parseNumber(m[2]);
      if (value !== null && value > 0) {
        return { kind: "countable", value, prefix: m[1].trim(), suffix: m[3].trim() };
      }
    }
    return { kind: "uncountable", text };
  },

  /** 人数に合わせて増減する。数えられない分量はそのまま */
  scale(q: Quantity, factor: number): Quantity {
    return q.kind === "countable" ? { ...q, value: q.value * factor } : q;
  },

  /** 合算できるか（数えられて、単位が同じ） */
  canAdd(a: Quantity, b: Quantity): boolean {
    return a.kind === "countable" && b.kind === "countable" && a.prefix === b.prefix && a.suffix === b.suffix;
  },

  add(a: Quantity, b: Quantity): Quantity {
    if (a.kind !== "countable" || b.kind !== "countable" || !Quantity.canAdd(a, b)) {
      throw new Error("単位の違う分量は合算できません");
    }
    return { ...a, value: a.value + b.value };
  },

  format(q: Quantity): string {
    if (q.kind === "uncountable") return q.text;
    return `${q.prefix}${formatNumber(q.value, q.suffix)}${q.suffix}`;
  },
};

const FRACTIONS: [number, string][] = [
  [1 / 4, "1/4"],
  [1 / 3, "1/3"],
  [1 / 2, "1/2"],
  [2 / 3, "2/3"],
  [3 / 4, "3/4"],
];

/** レシピでよく使う書き方に寄せる（1.5 → 1と1/2、0.5 → 1/2、g や ml は整数） */
function formatNumber(value: number, suffix: string): string {
  if (/^(g|kg|ml|cc|l|mg)$/i.test(suffix) && value >= 10) return String(Math.round(value));
  const whole = Math.floor(value + 1e-9);
  const rest = value - whole;
  if (rest < 0.01) return String(whole);
  const fraction = FRACTIONS.find(([f]) => Math.abs(rest - f) < 0.01);
  if (fraction) return whole === 0 ? fraction[1] : `${whole}と${fraction[1]}`;
  return String(Math.round(value * 10) / 10);
}
