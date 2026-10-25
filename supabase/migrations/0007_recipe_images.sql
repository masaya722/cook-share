-- 写真（料理本・雑誌のページ、スクリーンショット）からレシピを取り込めるようにする
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する。

-- 出典の種類に「写真」を足す
alter table public.recipes drop constraint if exists recipes_source_type_check;
alter table public.recipes
  add constraint recipes_source_type_check check (source_type in ('youtube', 'web', 'manual', 'image'));

-- 取り込んだ元の画像（公開 URL）。選んだ順に並べる
alter table public.recipes
  add column source_images text[] not null default '{}';

-- 画像の保存場所。URL を知っていれば見られる（推測できないランダムな名前にする）。
-- 一覧は外から見られず、アップロードと削除は家族だけができる
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "members can upload recipe images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-images' and public.is_member());

create policy "members can delete recipe images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-images' and public.is_member());
