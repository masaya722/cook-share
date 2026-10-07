-- 第 3 段階の片付け: 新しい献立（meals / dishes / leftovers）の動作確認が済んでから実行する。
-- 古い献立テーブルと、それを使っていた保存用の関数を消す。
drop function if exists public.save_menu_and_shopping(jsonb);
drop table if exists public.meal_plans;
