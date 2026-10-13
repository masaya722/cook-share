import type { DishId } from "../menu/meal";
import type { Ingredient } from "../recipe/ingredient";
import { Quantity } from "../recipe/quantity";
import { addDays, type CalendarDate, compareDates } from "../shared/calendar-date";
import { DomainError } from "../shared/domain-error";
import { ItemName } from "./item-name";
import { parseLine, parseLines } from "./shopping-line";

export type ShoppingItemId = string & { readonly __brand: "ShoppingItemId" };

/** 出どころ: 献立の品から自動で来たか、手で書いたか */
export type Origin = { kind: "dish"; dishId: DishId; recipeTitle: string } | { kind: "manual" };

/** 買う物: 買い物リストに書いた 1 つの物（同じ品名でまとめる前） */
export type ShoppingItem = {
  readonly kind: "item";
  readonly id: ShoppingItemId;
  readonly name: ItemName;
  readonly quantity: Quantity;
  readonly origin: Origin;
  /** いつの献立で使うか。手で書いた物は null */
  readonly neededOn: CalendarDate | null;
  /** 買った日。買っていなければ null */
  readonly boughtOn: CalendarDate | null;
  /** 並び順（小さいほど上）。家族が並べ替えて決める */
  readonly position: number;
};

/** 区切り: メモ帳の空行のように、買う物をゆるくまとめる線 */
export type ShoppingDivider = {
  readonly kind: "divider";
  readonly id: ShoppingItemId;
  readonly position: number;
};

export type ShoppingEntry = ShoppingItem | ShoppingDivider;

/** 画面に出す 1 行。同じ品名の買う物をまとめたもの */
export type ShoppingRow = {
  readonly kind: "row";
  readonly key: string;
  readonly name: string;
  readonly quantityText: string;
  /** どのレシピで使うか */
  readonly recipeTitles: readonly string[];
  /** 一番早く使う日 */
  readonly neededOn: CalendarDate | null;
  readonly bought: boolean;
  /** この行にまとめた買う物（チェック・削除・移動はすべてに効く） */
  readonly itemIds: readonly ShoppingItemId[];
  /** 並べ替えでこの行の手前に入れるときの目印（一番上にある買う物） */
  readonly anchorId: ShoppingItemId;
  /** 1 行の文章として直せるか（まとめていない行だけ） */
  readonly editable: boolean;
  /** 直すときに入力欄に出す文章（「牛乳 2本」） */
  readonly editText: string;
};

export type DividerRow = { readonly kind: "divider"; readonly key: string; readonly id: ShoppingItemId };

export type ShoppingView = {
  /** まだ買っていない物と区切り。家族が決めた順 */
  readonly todo: readonly (ShoppingRow | DividerRow)[];
  /** 買った物（翌日に消える） */
  readonly bought: readonly ShoppingRow[];
};

/** 保存が必要な変更 */
export type ShoppingListChanges = {
  upserted: ShoppingEntry[];
  removedIds: ShoppingItemId[];
};

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;

/**
 * 集約: 買い物リスト。家族で 1 枚だけ、ずっと使い続ける。
 * 食材も日用品も同じリストに書く。書くときは何も選ばせず、整理（並べ替え・区切り）は後で行う。
 * S1: チェック状態は家族で共有する（保存先はリポジトリ）
 */
export class ShoppingList {
  private entries: Map<ShoppingItemId, ShoppingEntry>;
  private upserted = new Set<ShoppingItemId>();
  private removed = new Set<ShoppingItemId>();

  private constructor(
    entries: ShoppingEntry[],
    private readonly newId: () => string,
  ) {
    this.entries = new Map(entries.map((e) => [e.id, e]));
  }

  static reconstitute(entries: ShoppingEntry[], newId: () => string = () => crypto.randomUUID()): ShoppingList {
    return new ShoppingList(entries, newId);
  }

  all(): readonly ShoppingEntry[] {
    return [...this.entries.values()].sort(byPosition);
  }

  items(): ShoppingItem[] {
    return this.all().filter((e): e is ShoppingItem => e.kind === "item");
  }

  /** 献立の品の材料を加える（食材を品名に翻訳する）。同じ品の材料を二重に入れない（S8） */
  addFromDish(props: {
    dishId: DishId;
    recipeTitle: string;
    neededOn: CalendarDate;
    ingredients: readonly Ingredient[];
  }) {
    if (this.itemsOfDish(props.dishId).length > 0) return;
    for (const ingredient of props.ingredients) {
      this.put({
        kind: "item",
        id: this.newId() as ShoppingItemId,
        name: ItemName.fromFood(ingredient.food),
        quantity: ingredient.quantity,
        origin: { kind: "dish", dishId: props.dishId, recipeTitle: props.recipeTitle },
        neededOn: props.neededOn,
        boughtOn: null,
        position: this.nextPosition(),
      });
    }
  }

  /** 品が献立から外れたら、その品から来た買う物のうち、まだ買っていない物を消す */
  removeDish(dishId: DishId) {
    for (const item of this.itemsOfDish(dishId)) {
      if (!item.boughtOn) this.delete(item.id);
    }
  }

  /** 作る人数が変わったら、その品から来て、まだリストにある（買っていない）物の分量を合わせる。手で消した物は消えたまま */
  rescaleDish(dishId: DishId, fromServings: number, toServings: number) {
    const factor = toServings / fromServings;
    for (const item of this.itemsOfDish(dishId)) {
      if (!item.boughtOn) this.put({ ...item, quantity: Quantity.scale(item.quantity, factor) });
    }
  }

  /** 品名と分量を分けて書き足す（分量は任意） */
  addManual(props: { name: string; quantity?: string; neededOn?: CalendarDate | null }): ShoppingItem {
    const item: ShoppingItem = {
      kind: "item",
      id: this.newId() as ShoppingItemId,
      name: ItemName.of(props.name),
      quantity: Quantity.parse(props.quantity ?? ""),
      origin: { kind: "manual" },
      neededOn: props.neededOn ?? null,
      boughtOn: null,
      position: this.nextPosition(),
    };
    this.put(item);
    return item;
  }

  /**
   * メモ帳のように書き足す。1 行が 1 つの買う物で、「牛乳 2本」は品名と分量に分ける。
   * 何行もまとめて書いた（貼り付けた）ときは、空行や絵文字だけの見出しを区切りにする。末尾に足していく。
   */
  write(text: string): ShoppingEntry[] {
    const added: ShoppingEntry[] = [];
    for (const line of parseLines(text)) {
      if (line.kind === "divider") added.push(this.addDivider());
      else added.push(this.addManual({ name: line.name, quantity: line.quantity }));
    }
    return added;
  }

  /** 区切りを末尾に足す */
  addDivider(): ShoppingDivider {
    const divider: ShoppingDivider = {
      kind: "divider",
      id: this.newId() as ShoppingItemId,
      position: this.nextPosition(),
    };
    this.put(divider);
    return divider;
  }

  /** 書いた物を 1 行の文章として直す（「牛乳」→「牛乳 2本」、「豚ばら肉」→「豚こま 300g」） */
  edit(id: ShoppingItemId, text: string) {
    const item = this.getItem(id);
    const line = parseLine(text);
    if (!line) throw new DomainError("品名を入力してください");
    this.put({ ...item, name: ItemName.of(line.name), quantity: Quantity.parse(line.quantity) });
  }

  /** 冷蔵庫にある・常備品・別の物で代用 などの理由で消す。区切りも消せる */
  remove(ids: readonly ShoppingItemId[]) {
    for (const id of ids) {
      if (this.entries.has(id)) this.delete(id);
    }
  }

  markBought(ids: readonly ShoppingItemId[], today: CalendarDate) {
    for (const id of ids) {
      const item = this.getItem(id);
      if (!item.boughtOn) this.put({ ...item, boughtOn: today });
    }
  }

  /** 押し間違えたときに戻す。並んでいた場所に戻る */
  unmarkBought(ids: readonly ShoppingItemId[]) {
    for (const id of ids) {
      const item = this.getItem(id);
      if (item.boughtOn) this.put({ ...item, boughtOn: null });
    }
  }

  /** S3: 買った物は翌日に消える */
  purgeBought(today: CalendarDate) {
    for (const item of this.items()) {
      if (item.boughtOn && compareDates(item.boughtOn, today) < 0) this.delete(item.id);
    }
  }

  /**
   * 並べ替え: ids（1 行にまとめた買う物、または区切り）を beforeId の手前に動かす。beforeId が null なら一番下。
   * 動かした物だけ並び順を変える。
   */
  moveBefore(ids: readonly ShoppingItemId[], beforeId: ShoppingItemId | null) {
    const moving = new Set(ids);
    const moved = this.orderable().filter((e) => moving.has(e.id));
    if (moved.length === 0 || (beforeId && moving.has(beforeId))) return;

    let rest = this.orderable().filter((e) => !moving.has(e.id));
    let { lower, upper } = boundsBefore(rest, beforeId, moved.length);
    if (upper - lower < 1e-6 * (moved.length + 1)) {
      // 何度も間に入れて隙間がなくなったら、並び順を振り直す
      rest.forEach((e, i) => this.put({ ...e, position: i + 1 }));
      rest = this.orderable().filter((e) => !moving.has(e.id));
      ({ lower, upper } = boundsBefore(rest, beforeId, moved.length));
    }
    moved.forEach((e, i) => {
      this.put({ ...e, position: lower + ((upper - lower) * (i + 1)) / (moved.length + 1) });
    });
  }

  /**
   * S5: 同じ品名の買う物をまとめた行と区切りを、家族が決めた順に並べる。買った物は下にまとめる。
   * S6・S10: withinDays を指定すると「今日から n 日以内に使う物」に絞る（使う日のない物と過ぎた物は常に出す）。
   */
  view(options: { today: CalendarDate; withinDays?: number }): ShoppingView {
    const limit = options.withinDays ? addDays(options.today, options.withinDays - 1) : null;
    const groups = new Map<string, ShoppingItem[]>();
    for (const item of this.items()) {
      if (!item.boughtOn && limit && item.neededOn && compareDates(item.neededOn, limit) > 0) continue;
      const key = `${item.boughtOn ? "bought" : "todo"}:${item.name.key}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const rows = [...groups.entries()].map(([key, items]) => toRow(key, items));
    const positionOf = (row: ShoppingRow) => this.getItem(row.anchorId).position;

    const todo: { entry: ShoppingRow | DividerRow; position: number }[] = [
      ...rows.filter((r) => !r.bought).map((r) => ({ entry: r, position: positionOf(r) })),
      ...this.all()
        .filter((e): e is ShoppingDivider => e.kind === "divider")
        .map((d) => ({ entry: { kind: "divider" as const, key: d.id, id: d.id }, position: d.position })),
    ];
    return {
      todo: tidyDividers(todo.sort(byPosition).map((t) => t.entry)),
      bought: rows.filter((r) => r.bought).sort((a, b) => positionOf(a) - positionOf(b)),
    };
  }

  /** 保存が必要な変更を取り出す（取り出すと空になる） */
  pullChanges(): ShoppingListChanges {
    const changes = {
      upserted: [...this.upserted].map((id) => this.entries.get(id)!).filter(Boolean),
      removedIds: [...this.removed],
    };
    this.upserted.clear();
    this.removed.clear();
    return changes;
  }

  /** 並べ替えの対象（まだ買っていない物と区切り）を並び順に */
  private orderable(): ShoppingEntry[] {
    return this.all().filter((e) => e.kind === "divider" || !e.boughtOn);
  }

  private nextPosition(): number {
    const last = this.all().at(-1);
    return last ? Math.floor(last.position) + 1 : 1;
  }

  private itemsOfDish(dishId: DishId): ShoppingItem[] {
    return this.items().filter((i) => i.origin.kind === "dish" && i.origin.dishId === dishId);
  }

  private getItem(id: ShoppingItemId): ShoppingItem {
    const entry = this.entries.get(id);
    if (!entry || entry.kind !== "item") throw new DomainError("この買う物はリストにありません");
    return entry;
  }

  private put(entry: ShoppingEntry) {
    this.entries.set(entry.id, entry);
    this.upserted.add(entry.id);
    this.removed.delete(entry.id);
  }

  private delete(id: ShoppingItemId) {
    this.entries.delete(id);
    this.upserted.delete(id);
    this.removed.add(id);
  }
}

/** beforeId の手前に count 個入れるときの、並び順の下限と上限 */
function boundsBefore(rest: ShoppingEntry[], beforeId: ShoppingItemId | null, count: number) {
  const index = beforeId ? rest.findIndex((e) => e.id === beforeId) : -1;
  if (index < 0) {
    const lower = rest.at(-1)?.position ?? 0;
    return { lower, upper: lower + count + 1 };
  }
  const upper = rest[index].position;
  const lower = index > 0 ? rest[index - 1].position : upper - count - 1;
  return { lower, upper };
}

/** 絞り込みで間の行が消えたときに、区切りが並んだり先頭・末尾に残ったりしないようにする */
function tidyDividers(entries: (ShoppingRow | DividerRow)[]): (ShoppingRow | DividerRow)[] {
  const result: (ShoppingRow | DividerRow)[] = [];
  for (const e of entries) {
    if (e.kind === "divider" && (result.length === 0 || result.at(-1)!.kind === "divider")) continue;
    result.push(e);
  }
  while (result.at(-1)?.kind === "divider") result.pop();
  return result;
}

function toRow(key: string, items: ShoppingItem[]): ShoppingRow {
  const sorted = [...items].sort(byPosition);
  // 同じ単位どうしは合算し、合算できない分量（少々、別の単位）は並べる
  const quantities: Quantity[] = [];
  for (const { quantity } of sorted) {
    if (quantity.kind === "uncountable" && !quantity.text) continue;
    const index = quantities.findIndex((q) => Quantity.canAdd(q, quantity));
    if (index >= 0) quantities[index] = Quantity.add(quantities[index], quantity);
    else if (!quantities.some((q) => q.kind === "uncountable" && Quantity.format(q) === Quantity.format(quantity))) {
      quantities.push(quantity);
    }
  }

  const quantityText = quantities.map(Quantity.format).join(" ＋ ");
  const neededDates = sorted.map((i) => i.neededOn).filter((d): d is CalendarDate => d !== null);
  const name = sorted[0].name.text;
  return {
    kind: "row",
    key,
    name,
    quantityText,
    recipeTitles: [...new Set(sorted.flatMap((i) => (i.origin.kind === "dish" ? [i.origin.recipeTitle] : [])))],
    neededOn: neededDates.sort(compareDates)[0] ?? null,
    bought: sorted[0].boughtOn !== null,
    itemIds: sorted.map((i) => i.id),
    anchorId: sorted[0].id,
    editable: sorted.length === 1,
    editText: quantityText ? `${name} ${quantityText}` : name,
  };
}
