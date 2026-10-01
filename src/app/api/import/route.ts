import Anthropic from "@anthropic-ai/sdk";
import { extractRecipe } from "@/lib/import/extract";
import { fetchSource } from "@/lib/import/sources";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "ログインしてください" }, { status: 401 });
  }
  // 夫婦以外のアカウントに API 料金を使わせない
  const { data: member } = await supabase
    .from("members")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) {
    return Response.json({ error: "このアカウントは利用できません" }, { status: 403 });
  }

  const { url } = (await request.json().catch(() => ({}))) as { url?: string };
  if (!url || !URL.canParse(url)) {
    return Response.json({ error: "URL を入力してください" }, { status: 400 });
  }

  try {
    const source = await fetchSource(url);
    const recipe = await extractRecipe(source);
    return Response.json({ recipe });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "混み合っています。少し待ってから再試行してください" }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Claude API error", err.status, err.message);
      return Response.json({ error: "AI での読み取りに失敗しました" }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "取り込みに失敗しました";
    return Response.json({ error: message }, { status: 422 });
  }
}
