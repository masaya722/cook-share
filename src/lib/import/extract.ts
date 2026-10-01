import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { RecipeDraft } from "@/lib/types";
import type { SourceContent } from "./sources";

const ExtractedRecipe = z.object({
  is_recipe: z.boolean().describe("料理のレシピ（材料や作り方）が含まれていれば true"),
  title: z.string(),
  description: z.string().describe("どんな料理かを1〜2文で"),
  servings: z.string().describe("例: 2人分。不明なら空文字"),
  cook_time: z.string().describe("例: 30分。不明なら空文字"),
  ingredients: z.array(
    z.object({
      name: z.string().describe("材料名のみ。例: 玉ねぎ"),
      amount: z.string().describe("分量。例: 1個, 大さじ2, 200g, 少々。不明なら空文字"),
    }),
  ),
  steps: z.array(z.string()).describe("作り方。1要素1手順"),
  tags: z.array(z.string()).describe("料理のジャンルや主な食材などのタグを最大5個。例: 和食, 鶏肉, 作り置き"),
});

const SYSTEM_PROMPT = `あなたは料理レシピの整理係です。与えられた Web ページや YouTube 動画の情報から、家庭で作るためのレシピを日本語で抜き出してください。

- 材料は名前と分量を分けてください。「A」「★」などの合わせ調味料の記号は外し、材料名だけにしてください。
- 分量は元の表記を尊重し、「大さじ2」「200g」「1/2個」のように数字を含む形で書いてください。
- 作り方は、元の情報にある手順を簡潔に並べてください。字幕しかない場合は話の内容から手順を組み立ててください。
- 情報源に書かれていない材料や分量を推測で足さないでください。
- YouTube の概要欄のリンク先ページが動画と同じ料理なら、材料や手順の補完に使ってください。別の料理なら無視してください。
- レシピが見当たらない場合は is_recipe を false にしてください。`;

const client = new Anthropic();

export async function extractRecipe(source: SourceContent): Promise<RecipeDraft> {
  const body = source.jsonLdRecipe
    ? `以下はページに埋め込まれた構造化データ (schema.org Recipe) です。\n\n${JSON.stringify(source.jsonLdRecipe)}`
    : source.text;

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: betaZodOutputFormat(ExtractedRecipe),
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `情報源: ${source.kind === "youtube" ? "YouTube 動画" : "Web サイト"}\nURL: ${source.url}\nタイトル: ${source.title}\n\n${body}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("このページからはレシピを抽出できませんでした");
  }
  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("レシピの読み取りに失敗しました");
  }
  if (!parsed.is_recipe) {
    throw new Error("このページにはレシピが見つかりませんでした。手入力で登録してください");
  }

  return {
    title: parsed.title || source.title,
    source_url: source.url,
    source_type: source.kind,
    image_url: source.imageUrl,
    servings: parsed.servings || null,
    cook_time: parsed.cook_time || null,
    description: parsed.description || null,
    ingredients: parsed.ingredients.filter((i) => i.name.trim()),
    steps: parsed.steps.filter((s) => s.trim()),
    tags: parsed.tags,
    memo: null,
  };
}
