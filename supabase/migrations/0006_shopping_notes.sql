-- 買い物リストをメモ帳のように使えるようにする
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する。
--
-- - 区切り（メモ帳の空行にあたる）を持てるようにする: kind = 'divider'
-- - 家族が決めた並び順を持てるようにする: position（小さいほど上）
-- - food 列は買い出しの「品名」（食材に限らない）として使う。列名は変えない

alter table public.shopping_items drop constraint if exists shopping_items_food_check;

alter table public.shopping_items
  add column kind text not null default 'item' check (kind in ('item', 'divider')),
  add column position double precision;

-- 今ある買う物は、作られた順に並べる
update public.shopping_items s
set position = r.n
from (select id, row_number() over (order by created_at) as n from public.shopping_items) r
where s.id = r.id;

-- 並び順を指定せずに足された物は末尾に入る（この SQL を実行してから新しいアプリが届くまでの間の保存用）
alter table public.shopping_items
  alter column position set default extract(epoch from clock_timestamp()),
  alter column position set not null;

-- 品名は空にできない（区切りには品名がない）
alter table public.shopping_items
  add constraint shopping_items_name_required check (kind = 'divider' or length(trim(food)) > 0);

create index shopping_items_position_idx on public.shopping_items (position);

-- 区切りと並び順も保存できるようにする（ほかは 0003 と同じ）
create or replace function public.save_meals_and_shopping(changes jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  m jsonb;
  meal uuid;
begin
  for m in select value from jsonb_array_elements(coalesce(changes->'meals_save', '[]'::jsonb)) loop
    meal := (m->>'id')::uuid;

    insert into public.meals (id, date, meal_time, eating_out)
    values (meal, (m->>'date')::date, m->>'meal_time', (m->>'eating_out')::boolean)
    on conflict (id) do update set eating_out = excluded.eating_out;

    delete from public.dishes
    where meal_id = meal
      and id not in (select (d->>'id')::uuid from jsonb_array_elements(m->'dishes') as d);

    insert into public.dishes (id, meal_id, recipe_id, servings_to_cook)
    select (d->>'id')::uuid, meal, (d->>'recipe_id')::uuid, (d->>'servings_to_cook')::integer
    from jsonb_array_elements(m->'dishes') as d
    on conflict (id) do update set servings_to_cook = excluded.servings_to_cook;

    delete from public.leftovers
    where meal_id = meal
      and source_dish_id not in (select (l->>'source_dish_id')::uuid from jsonb_array_elements(m->'leftovers') as l);

    insert into public.leftovers (meal_id, source_dish_id)
    select meal, (l->>'source_dish_id')::uuid
    from jsonb_array_elements(m->'leftovers') as l
    on conflict do nothing;
  end loop;

  delete from public.meals
  where id in (select jsonb_array_elements_text(coalesce(changes->'meals_delete', '[]'::jsonb))::uuid);

  delete from public.recipes
  where id in (select jsonb_array_elements_text(coalesce(changes->'recipes_delete', '[]'::jsonb))::uuid);

  insert into public.shopping_items (id, kind, food, quantity, origin_dish_id, recipe_title, needed_on, bought_on, position)
  select
    (x->>'id')::uuid, coalesce(x->>'kind', 'item'), coalesce(x->>'food', ''), coalesce(x->>'quantity', ''),
    (x->>'origin_dish_id')::uuid, x->>'recipe_title',
    (x->>'needed_on')::date, (x->>'bought_on')::date,
    coalesce((x->>'position')::double precision, extract(epoch from clock_timestamp()))
  from jsonb_array_elements(coalesce(changes->'items_upsert', '[]'::jsonb)) as x
  on conflict (id) do update set
    kind = excluded.kind,
    food = excluded.food,
    quantity = excluded.quantity,
    origin_dish_id = excluded.origin_dish_id,
    recipe_title = excluded.recipe_title,
    needed_on = excluded.needed_on,
    bought_on = excluded.bought_on,
    position = excluded.position;

  delete from public.shopping_items
  where id in (select jsonb_array_elements_text(coalesce(changes->'items_delete', '[]'::jsonb))::uuid);

  if (changes->>'mark_backfilled')::boolean then
    update public.household_settings set shopping_backfilled_at = now() where id;
  end if;
end;
$$;
