import { DomainError } from "../shared/domain-error";

/**
 * 食材: 店で買う物としての名前。
 * 部位や種類は食材の一部（豚ばら肉 ≠ 豚ロース肉、豚肉 ≠ 豚ばら肉）。
 * 全角・半角や空白の違いだけは同じ食材とみなす。
 */
export class Food {
  private constructor(
    /** 表示用の名前（入力されたまま） */
    readonly name: string,
    /** 同じ食材かどうかの判定に使うキー */
    readonly key: string,
  ) {}

  static of(name: string): Food {
    const trimmed = name.trim();
    if (!trimmed) throw new DomainError("食材名を入力してください");
    return new Food(trimmed, Food.normalize(trimmed));
  }

  private static normalize(name: string): string {
    return name
      .normalize("NFKC")
      .replace(/[（]/g, "(")
      .replace(/[）]/g, ")")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  equals(other: Food): boolean {
    return this.key === other.key;
  }
}
