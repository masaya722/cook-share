-- 買い物リストを、自由に書けるメモ帳（☐ ☑ でチェックできる）にする
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する。
-- 古い shopping_items はこの SQL では消さない（新しいアプリの動作確認後に 0009 で片付ける）。

-- 家族で 1 枚だけの買い物メモ
create table public.shopping_memo (
  id boolean primary key default true check (id),
  text text not null default '',
  -- 「献立の材料を反映」で、すでに材料をメモに入れた品（2 回目は入れない）
  reflected_dish_ids uuid[] not null default '{}',
  -- 保存されるたびに増える番号。2 人の書き換えがぶつかったかを見分けるのに使う
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.shopping_memo enable row level security;

create policy "members can do everything on shopping_memo" on public.shopping_memo
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- 今の買い物リストを、並び順のままメモの文章に移す（買った物は ☑、区切りは空行）。
-- 今ある献立の品は、これまでの仕組みで材料がリストに入っているので、反映済みにしておく
insert into public.shopping_memo (id, text, reflected_dish_ids)
select
  true,
  coalesce(
    string_agg(
      case
        when kind = 'divider' then ''
        else (case when bought_on is null then '☐ ' else '☑ ' end)
          || food
          || case when quantity <> '' then ' ' || quantity else '' end
      end,
      E'\n' order by position
    ),
    ''
  ),
  coalesce((select array_agg(id) from public.dishes), '{}')
from public.shopping_items;

-- 保存されているメモの番号が expected_version のときだけ保存し、新しい番号を返す。
-- 相手が先に保存していて番号が違えば保存せず null を返す（アプリが行単位でまとめてからやり直す）
create or replace function public.save_shopping_memo(new_text text, new_reflected uuid[], expected_version integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved integer;
begin
  update public.shopping_memo
  set text = new_text,
      reflected_dish_ids = new_reflected,
      version = version + 1,
      updated_at = now()
  where id and version = expected_version
  returning version into saved;
  return saved;
end;
$$;

-- もう一人が書き換えたら、すぐ画面に反映する
alter publication supabase_realtime add table public.shopping_memo;
