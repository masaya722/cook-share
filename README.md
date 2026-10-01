# うちのレシピ (cook-share)

夫婦でレシピを共有する PWA。iPhone・Android どちらもホーム画面に追加して使う。

- YouTube 動画・レシピサイトの URL から、材料と作り方を Claude が読み取って保存
- レシピの編集、一覧からの検索（料理名・材料・タグ）
- 献立カレンダー（週表示・朝昼夜）
- 期間を選ぶと、その間の献立に必要な材料を合算した買い物リストを表示（チェック・テキストコピー可）

構成: Next.js 16 (App Router) / Supabase (DB・認証) / Claude API / Vercel

## セットアップ

### 1. Supabase

1. [supabase.com](https://supabase.com) でプロジェクトを作成（無料プランで十分）
2. **SQL Editor** で [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) を実行
3. **Authentication → Sign In / Providers** で「Allow new users to sign up」をオフにする
4. **Authentication → Users → Add user** で 2 人分のユーザーを作成（「Auto Confirm User」にチェック）
5. SQL Editor で 2 人をメンバー登録する（ここに登録されたユーザーだけがデータを読み書きできる）

   ```sql
   insert into public.members (user_id, display_name)
   select id, '夫' from auth.users where email = 'husband@example.com'
   union all
   select id, '妻' from auth.users where email = 'wife@example.com';
   ```

6. **Project Settings → API Keys** から URL と Publishable key を控える

### 2. Claude API キー

[Claude Console](https://platform.claude.com/) で API キーを発行する。取り込み 1 件あたり数円程度。

### 3. ローカルで動かす

```bash
cp .env.example .env.local   # 値を埋める
npm install
npm run dev
```

### 4. Vercel にデプロイ

1. このリポジトリを GitHub に push し、[Vercel](https://vercel.com) で Import（Hobby プランで可）
2. Environment Variables に `.env.example` の 3 つを設定してデプロイ

## スマホへのインストール

- **iPhone（Safari）**: デプロイした URL を開いてログイン → 共有ボタン → 「ホーム画面に追加」
- **Android（Chrome）**: URL を開いてログイン → メニュー → 「アプリをインストール」

### レシピの取り込み方

- **Android**: インストール後は YouTube アプリやブラウザの「共有」メニューに「うちのレシピ」が出るので、選ぶだけで取り込みが始まる
- **iPhone**: iOS は Web アプリへの共有に対応していないため、YouTube などで「リンクをコピー」→ アプリの「＋ 追加」→「貼り付け」→「取り込む」

## 補足

- 字幕は YouTube 側の制限でサーバーから取れないことがある。その場合は概要欄だけで読み取るので、概要欄にレシピがない動画は手直しが必要
- 買い物リストのチェック状態は端末ごとに保存される
- 材料の合算は「大さじ2」「200g」のように単位が同じものだけを足し、「少々」などはそのまま並べる
