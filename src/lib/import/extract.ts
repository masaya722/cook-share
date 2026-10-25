import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import type { RecipeDraft } from "@/lib/types";
import type { SourceContent } from "./sources";

const ExtractedRecipe = z.object({
  is_recipe: z.boolean().describe("料理のレシピ（材料や作り方）が含まれていれば true"),
  title: z.string(),
  description: z.string().describe("どんな料理かを1〜2文で"),
  servings: z
    .number()
    .int()
    .describe("材料が何人分か。「2人分」「材料(1人前)」などの記載から数字だけ。幅があれば少ない方。記載がなければ 0"),
  cook_time: z.string().describe("例: 30分。不明なら空文字"),
  ingredients: z.array(
    z.object({
      food: z.string().describe("店で買うときの食材名。部位や種類も含める。例: 豚ばら肉, 鶏もも肉, 玉ねぎ"),
      amount: z.string().describe("分量。例: 1個, 大さじ2, 200g, 少々。不明なら空文字"),
      preparation: z.string().describe("下ごしらえ。例: みじん切り, 薄切り, すりおろし。なければ空文字"),
    }),
  ),
  steps: z.array(z.string()).describe("作り方。1要素1手順"),
  tags: z.array(z.string()).describe("料理のジャンルや主な食材などのタグを最大5個。例: 和食, 鶏肉, 作り置き"),
});

const ExtractedFromImages = ExtractedRecipe.extend({
  dish_photo_index: z
    .number()
    .int()
    .describe("完成した料理が大きく写っている画像の番号（1 枚目が 0）。写っている画像がなければ -1"),
});

/** どの情報源でも共通の読み取り方（材料の分け方・分量・人数） */
const COMMON_RULES = `- 材料は「食材」「分量」「下ごしらえ」に分けてください。
  - 食材は、店で買うときの名前にします。部位や種類は食材に含めます（例: 「豚肉（ロース）」→ 豚ロース肉、「鶏肉（もも）」→ 鶏もも肉）。部位が書かれていなければ、書かれていないまま（豚肉）にしてください。
  - みじん切り・薄切り・すりおろし・室温に戻す など、買った後の扱いは下ごしらえに分けます（例: 「ニンニク(微塵切り)」→ 食材: ニンニク、下ごしらえ: 微塵切り）。
  - 「A」「★」などの合わせ調味料の記号は外してください。
- 分量は元の表記を尊重し、「大さじ2」「200g」「1/2個」のように数字を含む形で書いてください。
- 何人分かは、「2人分」「4人前」「材料(1人前)」「Serves 4」などの記載を探してください。見つからなければ 0 にし、推測しないでください。
- 情報源に書かれていない材料や分量を推測で足さないでください。
- レシピが見当たらない場合は is_recipe を false にしてください。`;

const WEB_PROMPT = `あなたは料理レシピの整理係です。与えられた Web ページや YouTube 動画の情報から、家庭で作るためのレシピを日本語で抜き出してください。

${COMMON_RULES}
- 構造化データがあれば、recipeYield も何人分かの手がかりにしてください。
- 作り方は、元の情報にある手順を簡潔に並べてください。字幕しかない場合は話の内容から手順を組み立ててください。
- YouTube の概要欄のリンク先ページが動画と同じ料理なら、材料や手順の補完に使ってください。別の料理なら無視してください。`;

const IMAGE_PROMPT = `あなたは料理レシピの整理係です。与えられた画像（料理本・雑誌のページを撮った写真や、レシピアプリ・SNS のスクリーンショット）から、家庭で作るためのレシピを日本語で抜き出してください。

${COMMON_RULES}
- 画像が複数枚あるときは、同じ 1 つのレシピを撮ったものです（材料のページと作り方のページなど）。選ばれた順に並んでいるので、まとめて 1 つのレシピにしてください。
- 1 枚に複数のレシピが載っているときは、一番大きく載っているものを選んでください。
- 作り方は、画像に書かれている手順を簡潔に並べてください。番号があればその順にしてください。
- 文字が読み取れない部分を推測で埋めないでください。
- 完成した料理が大きく写っている画像があれば、その番号を dish_photo_index に入れてください。`;

const client = new Anthropic();

async function extractWith<S extends z.ZodType>(
  schema: S,
  system: string,
  content: string | BetaContentBlockParam[],
): Promise<z.infer<S>> {
  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: betaZodOutputFormat(schema),
    },
    system,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("この内容からはレシピを抽出できませんでした");
  }
  const parsed = response.parsed_output as z.infer<S> | null;
  if (!parsed) {
    throw new Error("レシピの読み取りに失敗しました");
  }
  return parsed;
}

/** 読み取った内容のうち、どの情報源でも同じ部分を下書きの形にする */
function toDraftContent(parsed: z.infer<typeof ExtractedRecipe>) {
  if (!parsed.is_recipe) {
    throw new Error("レシピが見つかりませんでした。手入力で登録してください");
  }
  return {
    servings: parsed.servings > 0 ? parsed.servings : null,
    cook_time: parsed.cook_time || null,
    description: parsed.description || null,
    ingredients: parsed.ingredients
      .filter((i) => i.food.trim())
      .map((i) => ({ name: i.food.trim(), amount: i.amount.trim(), preparation: i.preparation.trim() })),
    steps: parsed.steps.filter((s) => s.trim()),
    tags: parsed.tags,
    memo: null,
  };
}

/** YouTube 動画・Web ページから読み取る */
export async function extractRecipe(source: SourceContent): Promise<RecipeDraft> {
  const body = source.jsonLdRecipe
    ? `以下はページに埋め込まれた構造化データ (schema.org Recipe) です。\n\n${JSON.stringify(source.jsonLdRecipe)}`
    : source.text;

  const parsed = await extractWith(
    ExtractedRecipe,
    WEB_PROMPT,
    `情報源: ${source.kind === "youtube" ? "YouTube 動画" : "Web サイト"}\nURL: ${source.url}\nタイトル: ${source.title}\n\n${body}`,
  );

  return {
    title: parsed.title || source.title,
    source_url: source.url,
    source_type: source.kind,
    image_url: source.imageUrl,
    source_images: [],
    ...toDraftContent(parsed),
  };
}

/**
 * 写真（料理本・雑誌のページ、スクリーンショット）から読み取る。複数枚は 1 つのレシピとして選んだ順に読む。
 * 一覧や詳細の写真には、完成した料理が写っている画像を使い、なければ 1 枚目を使う。
 */
export async function extractRecipeFromImages(imageUrls: string[]): Promise<RecipeDraft> {
  const parsed = await extractWith(ExtractedFromImages, IMAGE_PROMPT, [
    ...imageUrls.map((url): BetaContentBlockParam => ({ type: "image", source: { type: "url", url } })),
    { type: "text", text: `画像は ${imageUrls.length} 枚です。この順に読んで、1 つのレシピにしてください。` },
  ]);

  const dishPhoto = imageUrls[parsed.dish_photo_index] ?? imageUrls[0];
  return {
    title: parsed.title || "写真から取り込んだレシピ",
    source_url: null,
    source_type: "image",
    image_url: dishPhoto ?? null,
    source_images: imageUrls,
    ...toDraftContent(parsed),
  };
}
