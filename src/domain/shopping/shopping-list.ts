import type { DishId } from "../menu/meal";
import { Food } from "../recipe/food";
import type { Ingredient } from "../recipe/ingredient";
import { Quantity } from "../recipe/quantity";
import { addDays, type CalendarDate, compareDates } from "../shared/calendar-date";
import { DomainError } from "../shared/domain-error";

export type ShoppingItemId = string & { readonly __brand: "ShoppingItemId" };

/** 出どころ: 献立の品から自動で来たか、手で足したか */
export type Origin = { kind: "dish"; dishId: DishId; recipeTitle: string } | { kind: "manual" };

/** 買う物: 買い物リストの 1 行（合算前） */
export type ShoppingItem = {
  readonly id: ShoppingItemId;
  readonly food: Food;
  readonly quantity: Quantity;
  readonly origin: Origin;
  /** いつの献立で使うか。手で足した物は null */
  readonly neededOn: CalendarDate | null;
  /** 買った日。買っていなければ null */
  readonly boughtOn: CalendarDate | null;
};

/** 画面に出す 1 行。同じ食材の買う物を合算したもの */
export type ShoppingRow = {
  readonly key: string;
  readonly foodName: string;
  readonly quantityText: string;
  /** どのレシピで使うか */
  readonly recipeTitles: readonly string[];
  /** 一番早く使う日 */
  readonly neededOn: CalendarDate | null;
  readonly bought: boolean;
  /** この行にまとめた買う物（チェックや削除はすべてに効く） */
  readonly itemIds: readonly ShoppingItemId[];
};

/** 保存が必要な変更 */
export type ShoppingListChanges = {
  upserted: ShoppingItem[];
  removedIds: ShoppingItemId[];
};

/**
 * 集約: 買い物リスト。家族で 1 枚だけ、ずっと使い続ける。
 * S1: チェック状態は家族で共有する（保存先はリポジトリ）
 */
export class ShoppingList {
  private items: Map<ShoppingItemId, ShoppingItem>;
  private upserted = new Set<ShoppingItemId>();
  private removed = new Set<ShoppingItemId>();

  private constructor(
    items: ShoppingItem[],
    private readonly newId: () => string,
  ) {
    this.items = new Map(items.map((i) => [i.id, i]));
  }

  static reconstitute(items: ShoppingItem[], newId: () => string = () => crypto.randomUUID()): ShoppingList {
    return new ShoppingList(items, newId);
  }

  all(): readonly ShoppingItem[] {
    return [...this.items.values()];
  }

  /** 献立の品の材料を加える。同じ品の材料を二重に入れない */
  addFromDish(props: {
    dishId: DishId;
    recipeTitle: string;
    neededOn: CalendarDate;
    ingredients: readonly Ingredient[];
  }) {
    if (this.itemsOfDish(props.dishId).length > 0) return;
    for (const ingredient of props.ingredients) {
      this.put({
        id: this.newId() as ShoppingItemId,
        food: ingredient.food,
        quantity: ingredient.quantity,
        origin: { kind: "dish", dishId: props.dishId, recipeTitle: props.recipeTitle },
        neededOn: props.neededOn,
        boughtOn: null,
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

  /** 牛乳・バナナ・代わりの食材などを手で足す */
  addManual(props: { food: string; quantity?: string; neededOn?: CalendarDate | null }): ShoppingItem {
    const item: ShoppingItem = {
      id: this.newId() as ShoppingItemId,
      food: Food.of(props.food),
      quantity: Quantity.parse(props.quantity ?? ""),
      origin: { kind: "manual" },
      neededOn: props.neededOn ?? null,
      boughtOn: null,
    };
    this.put(item);
    return item;
  }

  /** 冷蔵庫にある・常備品・別の物で代用 などの理由で消す */
  remove(ids: readonly ShoppingItemId[]) {
    for (const id of ids) {
      if (this.items.has(id)) this.delete(id);
    }
  }

  markBought(ids: readonly ShoppingItemId[], today: CalendarDate) {
    for (const id of ids) {
      const item = this.get(id);
      if (!item.boughtOn) this.put({ ...item, boughtOn: today });
    }
  }

  /** 押し間違えたときに戻す */
  unmarkBought(ids: readonly ShoppingItemId[]) {
    for (const id of ids) {
      const item = this.get(id);
      if (item.boughtOn) this.put({ ...item, boughtOn: null });
    }
  }

  /** S3: 買った物は翌日に消える */
  purgeBought(today: CalendarDate) {
    for (const item of this.items.values()) {
      if (item.boughtOn && compareDates(item.boughtOn, today) < 0) this.delete(item.id);
    }
  }

  /**
   * S5: 同じ食材をまとめた行。S6: withinDays を指定すると「今日から n 日以内に使う物」に絞る。
   * 使う日が決まっていない物（手で足した物）と、使う日を過ぎた物は常に出す。
   */
  rows(options: { today: CalendarDate; withinDays?: number }): ShoppingRow[] {
    const limit = options.withinDays ? addDays(options.today, options.withinDays - 1) : null;
    const groups = new Map<string, ShoppingItem[]>();
    for (const item of this.items.values()) {
      if (!item.boughtOn && limit && item.neededOn && compareDates(item.neededOn, limit) > 0) continue;
      const key = `${item.boughtOn ? "bought" : "todo"}:${item.food.key}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    const rows = [...groups.entries()].map(([key, items]) => toRow(key, items));
    return rows.sort(
      (a, b) =>
        Number(a.bought) - Number(b.bought) ||
        compareDates(a.neededOn ?? options.today, b.neededOn ?? options.today) ||
        a.foodName.localeCompare(b.foodName, "ja"),
    );
  }

  /** 保存が必要な変更を取り出す（取り出すと空になる） */
  pullChanges(): ShoppingListChanges {
    const changes = {
      upserted: [...this.upserted].map((id) => this.items.get(id)!).filter(Boolean),
      removedIds: [...this.removed],
    };
    this.upserted.clear();
    this.removed.clear();
    return changes;
  }

  private itemsOfDish(dishId: DishId): ShoppingItem[] {
    return [...this.items.values()].filter((i) => i.origin.kind === "dish" && i.origin.dishId === dishId);
  }

  private get(id: ShoppingItemId): ShoppingItem {
    const item = this.items.get(id);
    if (!item) throw new DomainError("この買う物はリストにありません");
    return item;
  }

  private put(item: ShoppingItem) {
    this.items.set(item.id, item);
    this.upserted.add(item.id);
    this.removed.delete(item.id);
  }

  private delete(id: ShoppingItemId) {
    this.items.delete(id);
    this.upserted.delete(id);
    this.removed.add(id);
  }
}

function toRow(key: string, items: ShoppingItem[]): ShoppingRow {
  // 同じ単位どうしは合算し、合算できない分量（少々、別の単位）は並べる
  const quantities: Quantity[] = [];
  for (const { quantity } of items) {
    if (quantity.kind === "uncountable" && !quantity.text) continue;
    const index = quantities.findIndex((q) => Quantity.canAdd(q, quantity));
    if (index >= 0) quantities[index] = Quantity.add(quantities[index], quantity);
    else if (!quantities.some((q) => q.kind === "uncountable" && Quantity.format(q) === Quantity.format(quantity))) {
      quantities.push(quantity);
    }
  }

  const neededDates = items.map((i) => i.neededOn).filter((d): d is CalendarDate => d !== null);
  return {
    key,
    foodName: items[0].food.name,
    quantityText: quantities.map(Quantity.format).join(" ＋ "),
    recipeTitles: [
      ...new Set(items.flatMap((i) => (i.origin.kind === "dish" ? [i.origin.recipeTitle] : []))),
    ],
    neededOn: neededDates.sort(compareDates)[0] ?? null,
    bought: items[0].boughtOn !== null,
    itemIds: items.map((i) => i.id),
  };
}
