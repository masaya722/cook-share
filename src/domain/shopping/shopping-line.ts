import { Quantity } from "../recipe/quantity";

/** メモ帳のように書いた 1 行を読んだ結果 */
export type WrittenLine = { kind: "item"; name: string; quantity: string } | { kind: "divider" };

// 行の先頭に付けがちな箇条書きの記号（メモ帳から貼り付けたとき用）
const BULLET = /^[\s・･\-－‐*＊•●○◦▪■□☐☑✓✔︎]+/u;
// 数字のない分量としてよく書かれる言葉（「塩 少々」）
const UNCOUNTABLE = /^(少々|少量|適量|適宜|ひとつまみ|ひとつかみ|お好みで|好みで)$/;
// 絵文字だけの行（メモ帳の 🛒 や 💊 の見出し）は区切りとして扱う
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Component}‍️\s]+$/u;

/**
 * 1 行を品名と分量に分ける。「牛乳 2本」→ 品名「牛乳」・分量「2本」。
 * 最後の空白より後ろが分量（数えられる分量か「少々」などの言葉）のときだけ分け、
 * それ以外（「李錦記 オイスターソース」）は全体を品名にする。
 * 空の行は null。
 */
export function parseLine(raw: string): { name: string; quantity: string } | null {
  const text = raw.replace(BULLET, "").trim();
  if (!text) return null;
  const m = /^(.*\S)[\s　]+(\S+)$/u.exec(text);
  if (m && (Quantity.parse(m[2]).kind === "countable" || UNCOUNTABLE.test(m[2]))) {
    return { name: m[1].trim(), quantity: m[2] };
  }
  return { name: text, quantity: "" };
}

/**
 * 何行もまとめて書いた（貼り付けた）文章を読む。
 * 1 行が 1 つの買う物。空行と絵文字だけの見出しは区切りにする（続く区切りは 1 つにまとめ、先頭と末尾の区切りは捨てる）。
 */
export function parseLines(text: string): WrittenLine[] {
  const lines: WrittenLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const isDivider = !raw.replace(BULLET, "").trim() || EMOJI_ONLY.test(raw);
    if (isDivider) {
      if (lines.length > 0 && lines.at(-1)!.kind !== "divider") lines.push({ kind: "divider" });
      continue;
    }
    const line = parseLine(raw);
    if (line) lines.push({ kind: "item", ...line });
  }
  while (lines.at(-1)?.kind === "divider") lines.pop();
  return lines;
}
