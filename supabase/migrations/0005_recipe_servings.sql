-- 第 4 段階: 基準人数（レシピの分量が何人分か）を数値で持つ
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する。
--
-- 今は「2人分」「材料(1人前)」「2〜3人分」のような文字列で持っている。
-- 「〇人分」「〇人前」の数字を取り出し（幅があれば少ない方）、記載がなければ null にする。
-- null のレシピは、アプリが 2 人分とみなして「記載なし」と表示する。

alter table public.recipes
  alter column servings type integer
  using (
    case
      when (substring(normalize(servings, NFKC) from '(\d+)\s*(?:[〜~～-]\s*\d+\s*)?人\s*(?:分|前)'))::integer > 0
        then (substring(normalize(servings, NFKC) from '(\d+)\s*(?:[〜~～-]\s*\d+\s*)?人\s*(?:分|前)'))::integer
    end
  );

alter table public.recipes
  add constraint recipes_servings_positive check (servings is null or servings >= 1);
