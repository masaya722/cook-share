/** 家族がいつも作る人数。基準人数の記載がないレシピはこの人数分とみなす */
export const HOUSEHOLD_SERVINGS = 2;

/**
 * 基準人数: レシピの分量が何人分か。
 * 記載がなければ 2 人分とみなし、assumed で「みなし」であることを示す。
 */
export type Servings = {
  readonly count: number;
  readonly assumed: boolean;
};

export const Servings = {
  of(count: number): Servings {
    if (!Number.isFinite(count) || count <= 0) throw new Error("人数は 1 以上にしてください");
    return { count, assumed: false };
  },

  assumed(): Servings {
    return { count: HOUSEHOLD_SERVINGS, assumed: true };
  },

  /** 「2人分」「2〜3人前」「材料(1人前)」のような記載から読み取る。幅があるときは少ない方を採る */
  parse(text: string | null | undefined): Servings {
    if (!text) return Servings.assumed();
    const m = /(\d+)\s*(?:[〜~～\-]\s*\d+\s*)?人\s*(?:分|前)/.exec(text.normalize("NFKC"));
    if (!m) return Servings.assumed();
    const count = Number(m[1]);
    return count > 0 ? Servings.of(count) : Servings.assumed();
  },

  label(s: Servings): string {
    return s.assumed ? `${s.count}人分（記載なし）` : `${s.count}人分`;
  },
};
