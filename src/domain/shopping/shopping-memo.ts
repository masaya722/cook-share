import type { DishId } from "../menu/meal";
import { Quantity } from "../recipe/quantity";
import type { Recipe } from "../recipe/recipe";
import { type CalendarDate, compareDates, dateLabel } from "../shared/calendar-date";
import { DomainError } from "../shared/domain-error";

/** チェックできる行の印。行の頭に付ける */
export const OPEN_BOX = "☐";
export const DONE_BOX = "☑";

/** メモの 1 行。☐/☑ で始まる行はチェックできる行、それ以外は見出しや一言メモ */
export type MemoLine = { kind: "check"; done: boolean; text: string } | { kind: "text"; text: string };

const CHECK_LINE = /^\s*([☐☑□✅])\s?(.*)$/u;

/** 改行の表し方をそろえる（iPhone のメモ帳などからは \r や行区切り U+2028 で届くことがある） */
export function normalizeText(text: string): string {
  return text.replace(/\r\n|[\r\u2028\u2029\u0085]/g, "\n");
}

export function memoLines(text: string): string[] {
  return normalizeText(text).split("\n");
}

export function parseMemoLine(line: string): MemoLine {
  const m = CHECK_LINE.exec(line);
  if (!m) return { kind: "text", text: line };
  return { kind: "check", done: m[1] === DONE_BOX || m[1] === "✅", text: m[2] };
}

function formatMemoLine(line: MemoLine): string {
  return line.kind === "text" ? line.text : `${line.done ? DONE_BOX : OPEN_BOX} ${line.text}`;
}

/** チェックできる行の ☐ ↔ ☑ を切り替える。チェックできない行はそのまま */
export function toggleLine(text: string, index: number): string {
  const lines = memoLines(text);
  const line = parseMemoLine(lines[index] ?? "");
  if (line.kind !== "check") return text;
  lines[index] = formatMemoLine({ ...line, done: !line.done });
  return lines.join("\n");
}

/** 買った行（☑）をまとめて消す。消した後に空行が 3 つ以上続かないようにする */
export function removeDoneLines(text: string): string {
  const kept = memoLines(text).filter((l) => {
    const line = parseMemoLine(l);
    return !(line.kind === "check" && line.done);
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
}

/** 献立の材料を反映するときに渡す品 */
export type DishToReflect = {
  dishId: DishId;
  date: CalendarDate;
  recipe: Recipe;
  servingsToCook: number;
};

/**
 * 集約: 買い物メモ。家族で 1 枚だけの、自由に書けるメモ帳。
 * 献立の材料は「反映」したときだけメモに入る（自動では変わらない）。
 */
export class ShoppingMemo {
  private constructor(
    readonly text: string,
    private readonly reflected: ReadonlySet<string>,
    /** 保存されるたびに増える番号。2 人の書き換えがぶつかったかを見分けるのに使う */
    readonly version: number,
  ) {}

  static reconstitute(props: { text: string; reflectedDishIds: readonly string[]; version: number }): ShoppingMemo {
    return new ShoppingMemo(normalizeText(props.text), new Set(props.reflectedDishIds), props.version);
  }

  get reflectedDishIds(): string[] {
    return [...this.reflected];
  }

  isReflected(dishId: string): boolean {
    return this.reflected.has(dishId);
  }

  withText(text: string): ShoppingMemo {
    return new ShoppingMemo(normalizeText(text), this.reflected, this.version);
  }

  /** 保存した後の番号を持たせる */
  withVersion(version: number): ShoppingMemo {
    return new ShoppingMemo(this.text, this.reflected, version);
  }

  /**
   * 献立の材料を反映する。まだ反映していない品の材料を、作る人数に合わせて合算し、
   * 見出しを付けてメモの末尾に足す。反映した品は覚えておき、2 回目は入れない。
   */
  reflect(dishes: readonly DishToReflect[], range: { from: CalendarDate; to: CalendarDate }): ShoppingMemo {
    const targets = dishes.filter((d) => !this.reflected.has(d.dishId));
    if (targets.length === 0) throw new DomainError("この期間に、まだ反映していない献立はありません");

    // 同じ食材は 1 行にまとめ、最初に出てきた順に並べる
    const groups = new Map<string, { name: string; quantities: Quantity[] }>();
    for (const dish of [...targets].sort((a, b) => compareDates(a.date, b.date))) {
      for (const ingredient of dish.recipe.ingredientsFor(dish.servingsToCook)) {
        const group = groups.get(ingredient.food.key) ?? { name: ingredient.food.name, quantities: [] };
        group.quantities.push(ingredient.quantity);
        groups.set(ingredient.food.key, group);
      }
    }
    const heading =
      range.from === range.to
        ? `【${dateLabel(range.from)}の献立の材料】`
        : `【${dateLabel(range.from)}〜${dateLabel(range.to)}の献立の材料】`;
    const block = [
      heading,
      ...[...groups.values()].map((g) => {
        const quantity = Quantity.sumText(g.quantities);
        return `${OPEN_BOX} ${g.name}${quantity ? ` ${quantity}` : ""}`;
      }),
    ];

    const body = this.text.replace(/\n+$/, "");
    const text = body ? `${body}\n\n${block.join("\n")}` : block.join("\n");
    return new ShoppingMemo(text, new Set([...this.reflected, ...targets.map((d) => d.dishId)]), this.version);
  }
}

// ---- 2 人の書き換えをまとめる ----

/** 同じ行かどうかを見る鍵（チェックの状態は含めない） */
function lineKey(line: string): string {
  const parsed = parseMemoLine(line);
  return parsed.kind === "check" ? `☐${parsed.text.trim()}` : parsed.text.trimEnd();
}

/** 2 つの行の並びのうち、同じ行どうしの対応（最長共通部分列） */
function matchLines(a: string[], b: string[]): [number, number][] {
  const ka = a.map(lineKey);
  const kb = b.map(lineKey);
  const dp = Array.from({ length: ka.length + 1 }, () => new Array<number>(kb.length + 1).fill(0));
  for (let i = ka.length - 1; i >= 0; i--) {
    for (let j = kb.length - 1; j >= 0; j--) {
      dp[i][j] = ka[i] === kb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < ka.length && j < kb.length) {
    if (ka[i] === kb[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return pairs;
}

/**
 * 2 人がほぼ同時に書き換えたときに、行単位でまとめる。
 * base（手元で書き始めたときの文章）から local（手元）で変えたこと — 足した行・消した行・チェックの切り替え — を、
 * server（相手の変更を含む最新）に当てはめる。両方が足した行はどちらも残る。
 */
export function mergeMemoText(base: string, server: string, local: string): string {
  const b = memoLines(base);
  const s = memoLines(server);
  const l = memoLines(local);

  const baseToLocal = new Map(matchLines(b, l).map(([bi, li]) => [bi, li]));
  const baseToServer = new Map(matchLines(b, s).map(([bi, si]) => [bi, si]));

  const result = [...s];
  const removeAt = new Set<number>();
  // 手元で消した行は、相手の文章からも消す。手元でチェックを変えた行は、相手の文章にも当てはめる
  b.forEach((line, bi) => {
    const si = baseToServer.get(bi);
    if (si === undefined) return;
    const li = baseToLocal.get(bi);
    if (li === undefined) removeAt.add(si);
    else if (l[li] !== line) result[si] = l[li];
  });

  // 手元で足した行は、手元で直前にあった（元からある）行の後ろに入れる
  const localToBase = new Map([...baseToLocal.entries()].map(([bi, li]) => [li, bi]));
  const inserts = new Map<number, string[]>(); // 相手の文章の何行目の後ろに入れるか（-1 は先頭）
  let anchor = -1;
  l.forEach((line, li) => {
    const bi = localToBase.get(li);
    if (bi !== undefined) {
      const si = baseToServer.get(bi);
      if (si !== undefined) anchor = si;
      return;
    }
    inserts.set(anchor, [...(inserts.get(anchor) ?? []), line]);
  });

  const merged: string[] = [...(inserts.get(-1) ?? [])];
  result.forEach((line, si) => {
    if (!removeAt.has(si)) merged.push(line);
    merged.push(...(inserts.get(si) ?? []));
  });
  return merged.join("\n");
}
