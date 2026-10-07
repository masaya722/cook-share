-- 第 2 段階: 買い物リストを保存して家族で共有する
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する。

-- 買う物（家族で 1 枚の買い物リストの行）
create table public.shopping_items (
  id uuid primary key,
  food text not null check (length(trim(food)) > 0),
  quantity text not null default '',
  -- 出どころ: 献立の品から来た物は品の id（今は meal_plans.id）とレシピ名。手で足した物は null
  origin_dish_id uuid,
  recipe_title text,
  -- いつの献立で使うか（手で足した物は null）
  needed_on date,
  -- 買った日（買っていなければ null）。翌日に消える
  bought_on date,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index shopping_items_origin_dish_id_idx on public.shopping_items (origin_dish_id);

create trigger shopping_items_touch_updated_at
before update on public.shopping_items
for each row execute function public.touch_updated_at();

alter table public.shopping_items enable row level security;

create policy "members can do everything on shopping_items" on public.shopping_items
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- 家族の設定（1 行だけ）。今は既存の献立を買い物リストに移したかどうかだけを持つ
create table public.household_settings (
  id boolean primary key default true check (id),
  shopping_backfilled_at timestamptz
);
insert into public.household_settings (id) values (true);

alter table public.household_settings enable row level security;

create policy "members can do everything on household_settings" on public.household_settings
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- 献立と買い物リストの変更を 1 つのトランザクションで保存する。
-- どう変えるかはアプリ（ドメイン層）が決め、ここは保存だけを受け持つ。
-- security invoker なので RLS（家族だけが読み書きできる）がそのまま効く。
create or replace function public.save_menu_and_shopping(changes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.meal_plans (id, date, meal, recipe_id)
  select (x->>'id')::uuid, (x->>'date')::date, x->>'meal', (x->>'recipe_id')::uuid
  from jsonb_array_elements(coalesce(changes->'meal_plans_insert', '[]'::jsonb)) as x;

  delete from public.meal_plans
  where id in (select jsonb_array_elements_text(coalesce(changes->'meal_plans_delete', '[]'::jsonb))::uuid);

  delete from public.recipes
  where id in (select jsonb_array_elements_text(coalesce(changes->'recipes_delete', '[]'::jsonb))::uuid);

  insert into public.shopping_items (id, food, quantity, origin_dish_id, recipe_title, needed_on, bought_on)
  select
    (x->>'id')::uuid, x->>'food', coalesce(x->>'quantity', ''),
    (x->>'origin_dish_id')::uuid, x->>'recipe_title',
    (x->>'needed_on')::date, (x->>'bought_on')::date
  from jsonb_array_elements(coalesce(changes->'items_upsert', '[]'::jsonb)) as x
  on conflict (id) do update set
    food = excluded.food,
    quantity = excluded.quantity,
    origin_dish_id = excluded.origin_dish_id,
    recipe_title = excluded.recipe_title,
    needed_on = excluded.needed_on,
    bought_on = excluded.bought_on;

  delete from public.shopping_items
  where id in (select jsonb_array_elements_text(coalesce(changes->'items_delete', '[]'::jsonb))::uuid);

  if (changes->>'mark_backfilled')::boolean then
    update public.household_settings set shopping_backfilled_at = now() where id;
  end if;
end;
$$;

-- 2 人で同時に使っているとき（買い出し中に家で牛乳を足す等）に、相手の変更がすぐ画面に出るようにする
alter publication supabase_realtime add table public.shopping_items;
