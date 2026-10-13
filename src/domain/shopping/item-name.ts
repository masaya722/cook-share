import type { Food } from "../recipe/food";
import { DomainError } from "../shared/domain-error";
import { nameKey } from "../shared/name-key";

/**
 * 品名: 買い物リストに書く物の名前。食材に限らず、日用品や文房具も入る。
 * 献立から入る材料は、レシピ帳の「食材」をここで品名に翻訳する。
 * 全角・半角や空白の違いだけは同じ品名とみなす（同じ品名の買う物は 1 行にまとめる）。
 */
export class ItemName {
  private constructor(
    /** 表示用の名前（書かれたまま） */
    readonly text: string,
    /** 同じ品名かどうかの判定に使うキー */
    readonly key: string,
  ) {}

  static of(text: string): ItemName {
    const trimmed = text.trim();
    if (!trimmed) throw new DomainError("品名を入力してください");
    return new ItemName(trimmed, nameKey(trimmed));
  }

  /** レシピ帳の食材を、買い出しの品名に翻訳する */
  static fromFood(food: Food): ItemName {
    return ItemName.of(food.name);
  }

  equals(other: ItemName): boolean {
    return this.key === other.key;
  }
}
