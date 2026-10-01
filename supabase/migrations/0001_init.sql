-- cook-share 初期スキーマ
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する。

-- 夫婦（アプリを使ってよいユーザー）の一覧。
-- 誤ってサインアップが有効になっても、ここに登録されていないユーザーは何も読めない。
create table public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
);

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members where user_id = auth.uid());
$$;

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_url text,
  source_type text not null default 'manual' check (source_type in ('youtube', 'web', 'manual')),
  image_url text,
  servings text,
  cook_time text,
  description text,
  -- [{ "name": "玉ねぎ", "amount": "1個" }, ...]
  ingredients jsonb not null default '[]'::jsonb,
  -- ["玉ねぎを薄切りにする", ...]
  steps jsonb not null default '[]'::jsonb,
  tags text[] not null default '{}',
  memo text,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_created_at_idx on public.recipes (created_at desc);

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  meal text not null default 'dinner' check (meal in ('breakfast', 'lunch', 'dinner')),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index meal_plans_date_idx on public.meal_plans (date);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_touch_updated_at
before update on public.recipes
for each row execute function public.touch_updated_at();

alter table public.members enable row level security;
alter table public.recipes enable row level security;
alter table public.meal_plans enable row level security;

create policy "members can read members" on public.members
  for select to authenticated using (public.is_member());

create policy "members can do everything on recipes" on public.recipes
  for all to authenticated using (public.is_member()) with check (public.is_member());

create policy "members can do everything on meal_plans" on public.meal_plans
  for all to authenticated using (public.is_member()) with check (public.is_member());
