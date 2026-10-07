-- 第 3 段階: 献立を「食事」「品」「残り物」に分ける
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する。
-- 古い meal_plans はこの SQL では消さない（新しいアプリの動作確認後に 0004 で片付ける）。

-- 食事: ある日の朝・昼・夜の 1 回分（M1: 日付×食事区分で 1 つ）
create table public.meals (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  meal_time text not null check (meal_time in ('breakfast', 'lunch', 'dinner')),
  eating_out boolean not null default false,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (date, meal_time)
);

-- 品: 献立に並ぶ 1 つの料理（M3: 作る人数は 1 人以上）
create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals (id) on delete cascade,
  -- R4: レシピを削除すると、そのレシピを使った品は献立から消える
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  servings_to_cook integer not null default 2 check (servings_to_cook >= 1),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index dishes_meal_id_idx on public.dishes (meal_id);
create index dishes_recipe_id_idx on public.dishes (recipe_id);

-- 残り物: 前の食事で多めに作った品を食べること（M7: 元の品が消えたら残り物も消える）
create table public.leftovers (
  meal_id uuid not null references public.meals (id) on delete cascade,
  source_dish_id uuid not null references public.dishes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (meal_id, source_dish_id)
);

create index leftovers_source_dish_id_idx on public.leftovers (source_dish_id);

alter table public.meals enable row level security;
alter table public.dishes enable row level security;
alter table public.leftovers enable row level security;

create policy "members can do everything on meals" on public.meals
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members can do everything on dishes" on public.dishes
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members can do everything on leftovers" on public.leftovers
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- 今の献立を移す。品の id は meal_plans の id を引き継ぐ（買い物リストの出どころとつながったままにするため）
insert into public.meals (date, meal_time, created_by)
select distinct on (date, meal) date, meal, created_by
from public.meal_plans
order by date, meal, created_at;

insert into public.dishes (id, meal_id, recipe_id, servings_to_cook, created_by, created_at)
select mp.id, m.id, mp.recipe_id, 2, mp.created_by, mp.created_at
from public.meal_plans mp
join public.meals m on m.date = mp.date and m.meal_time = mp.meal;

-- 食事（集約）と買い物リストの変更を 1 つのトランザクションで保存する。
-- meals_save の各要素は食事 1 つ分の全体（品・残り物を含む）で、ここに無い品・残り物は消える。
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
