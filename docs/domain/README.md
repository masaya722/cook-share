# ドメイン駆動設計

夫婦（ドメインエキスパート）との会話で決めた言葉とルールを、コードに写すためのドキュメント。

| ドキュメント | 内容 |
|---|---|
| [glossary.md](glossary.md) | ユビキタス言語（用語集）。コード上の名前もここで決める |
| [event-storming.md](event-storming.md) | 暮らしの中で起きる出来事と、決まったこと |
| [context-map.md](context-map.md) | 領域（境界づけられたコンテキスト）の分け方 |
| [domain-model.md](domain-model.md) | 集約・不変条件・コンテキスト間のポリシー |

## コードの構成

```
src/domain/            ドメイン層。Next.js・Supabase に依存しない（相対 import のみ）
  shared/              暦の日付、ドメインエラー
  recipe/              レシピ帳: 食材・分量・基準人数・材料・レシピ
  menu/                献立: 食事（品・残り物・外食）
  shopping/            買い出し: 買い物リスト、献立と連動するポリシー
src/application/       ユースケース（献立に品を加える、買った 等）。保存先は Store インターフェースで受け取る
src/infrastructure/    Store の Supabase 実装と、DB の行とドメインの変換
src/app/actions.ts     画面から呼ぶ Server Actions（ログイン確認 → ユースケース）
src/lib/, src/components/, src/app/   画面
```

ドメイン層のルールは `npm test` で確認できる（`*.test.ts` がそのまま仕様の一覧になっている）。

## 進め方

| 段階 | 内容 | 状態 |
|---|---|---|
| 1. ドメイン層 | ルールをテスト付きで `src/domain/` に書く。買い物リストの合算をドメイン層に置き換える | 完了 |
| 2. 買い出し | 買い物リストを保存して家族で共有。献立と自動連動、手で追加、チェック、使う日 | 完了 |
| 3. 献立 | 食事のまとまり、作る人数、外食、残り物、レシピ削除前の確認 | 未着手 |
| 4. 取り込み | AI が基準人数と「食材・下ごしらえ」を分けて読み取る | 未着手 |

献立と買い物リストの変更は、ユースケースがドメイン層で決め、`save_menu_and_shopping`（Postgres 関数）で 1 つのトランザクションとして保存する。
