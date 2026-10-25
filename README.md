# うちのレシピ (cook-share)

夫婦でレシピを共有する PWA。iPhone・Android どちらもホーム画面に追加して使う。

- YouTube 動画・レシピサイトの URL、または料理本・雑誌のページやスクリーンショットの写真（複数枚可）から、材料（食材・分量・下ごしらえ）・何人分か・作り方を Claude が読み取って保存
- レシピの編集、一覧からの検索（料理名・材料・タグ）
- 献立カレンダー（週表示・朝昼夜）。品ごとに作る人数を変えられ、外食・残り物も入れられる
- 家族で 1 枚の買い物リスト。メモ帳と同じように自由に書けて、行頭の ☐ をタップすると ☑ に（2 人で共有）。期間を選んで「献立の材料を反映」すると、まだ入れていない献立の材料が作る人数に合わせてまとめて入る

用語とルールは [docs/domain/](docs/domain/README.md)（ドメイン駆動設計のドキュメント）にまとめている。

構成: Next.js 16 (App Router) / Supabase (DB・認証) / Claude API / Vercel

## セットアップ

### 1. Supabase

1. [supabase.com](https://supabase.com) でプロジェクトを作成（無料プランで十分）
2. **SQL Editor** で [`supabase/migrations/`](supabase/migrations/) の SQL を番号順にすべて実行
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

### 2.5 YouTube Data API キー（推奨）

Vercel などのサーバーから YouTube のページを直接読むと、ボット判定されて概要欄が取れないことがある。公式 API を使うと確実に取れる（個人利用なら無料枠で足りる）。

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. 「API とサービス」→「ライブラリ」で **YouTube Data API v3** を有効化
3. 「認証情報」→「認証情報を作成」→「API キー」
4. 作成したキーの編集画面で「API の制限」を **YouTube Data API v3** のみにする
5. `YOUTUBE_API_KEY` として設定する

### 3. ローカルで動かす

```bash
cp .env.example .env.local   # 値を埋める
npm install
npm run dev
npm test                     # ドメイン層・ユースケースのテスト
```

### 4. Vercel にデプロイ

1. このリポジトリを GitHub に push し、[Vercel](https://vercel.com) で Import（Hobby プランで可）
2. Environment Variables に `.env.example` の値（`YOUTUBE_API_KEY` を含む）を設定してデプロイ

## スマホへのインストール

- **iPhone（Safari）**: デプロイした URL を開いてログイン → 共有ボタン → 「ホーム画面に追加」
- **Android（Chrome）**: URL を開いてログイン → メニュー → 「アプリをインストール」

### レシピの取り込み方

- **Android**: インストール後は YouTube アプリやブラウザの「共有」メニューに「うちのレシピ」が出るので、選ぶだけで取り込みが始まる
- **iPhone**: iOS は Web アプリへの共有に対応していないため、YouTube などで「リンクをコピー」→ アプリの「＋ 追加」→「貼り付け」→「取り込む」

## 補足

- 字幕は YouTube 側の制限でサーバーから取れないことが多い。概要欄と、概要欄にある「作り方はこちら」のリンク先ページから読み取るので、どちらにもレシピがない動画は手直しが必要
- 買い物リストは家族で 1 枚のメモ。献立の材料は「反映」を押したときだけ入り、その後で献立を変えてもメモは変わらない（足し引きはメモの上で）。☑ の行は「☑ を消す」でまとめて消す。2 人がほぼ同時に書いても、どちらの行も残る
- 材料の合算は、同じ食材で「大さじ2」「200g」のように単位が同じものだけを足し、「少々」などはそのまま並べる。部位が違う食材（豚ばら肉と豚ロース肉）は別の行にする

## ライセンス

[MIT](LICENSE)
