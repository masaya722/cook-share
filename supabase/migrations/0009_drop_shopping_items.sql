-- 買い物メモ（0008）に移ったので、1 行ずつの買い物リストの仕組みを片付ける
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する。実行したらすぐにアプリを更新する（push する）。
-- 実行してからアプリが更新されるまでの間は、献立の変更が保存できない（古いアプリが消した関数を呼ぶため）。

-- 献立の変更を 1 つのトランザクションで保存する（0006 の save_meals_and_shopping から買い物リストの部分を除いたもの）。
-- どう変えるかはアプリ（ドメイン層）が決め、ここは保存だけを受け持つ。
-- security invoker なので RLS（家族だけが読み書きできる）がそのまま効く。
create or replace function public.save_meals(changes jsonb)
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
end;
$$;

drop function if exists public.save_meals_and_shopping(jsonb);

-- 1 行ずつの買い物リスト（Realtime の対象からも一緒に外れる）
drop table if exists public.shopping_items;

-- 既存の献立を買い物リストに移したかどうかだけを持っていた設定
drop table if exists public.household_settings;
