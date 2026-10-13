/** 名前を「同じ物かどうか」の判定に使うキーにする。全角・半角や空白、大文字・小文字の違いは同じとみなす */
export function nameKey(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/[（]/g, "(")
    .replace(/[）]/g, ")")
    .replace(/\s+/g, "")
    .toLowerCase();
}
