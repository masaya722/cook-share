import { fetchText } from "./safe-fetch";

export type SourceContent = {
  kind: "youtube" | "web";
  url: string;
  title: string;
  imageUrl: string | null;
  /** Claude に渡す本文（概要欄・字幕・ページ本文など） */
  text: string;
  /** Web サイトに schema.org の Recipe が埋め込まれていれば、その JSON */
  jsonLdRecipe: Record<string, unknown> | null;
};

export function youtubeVideoId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  if (host !== "youtube.com") return null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const m = /^\/(shorts|live|embed)\/([^/?#]+)/.exec(url.pathname);
  return m ? m[2] : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    "i",
  );
  const m = re.exec(html);
  const v = m?.[1] ?? m?.[2];
  return v ? decodeEntities(v) : null;
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|iframe|header|footer|nav)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/li|\/h\d|\/tr|\/div)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t　]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const found = findRecipeNode(n);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    if (type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"))) return obj;
    if (obj["@graph"]) return findRecipeNode(obj["@graph"]);
  }
  return null;
}

function extractJsonLdRecipe(html: string): Record<string, unknown> | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const found = findRecipeNode(JSON.parse(m[1].trim()));
      if (found) return found;
    } catch {
      // 壊れた JSON-LD は無視する
    }
  }
  return null;
}

// 本文が極端に長いページ（コメント欄が延々と続くなど）への保険。レシピ本体は通常ここに収まる。
const MAX_TEXT_CHARS = 60_000;

async function fetchWeb(url: string): Promise<SourceContent> {
  const html = await fetchText(url);
  const title =
    metaContent(html, "og:title") ??
    decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "");
  const bodyHtml = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return {
    kind: "web",
    url,
    title,
    imageUrl: metaContent(html, "og:image"),
    text: htmlToText(bodyHtml).slice(0, MAX_TEXT_CHARS),
    jsonLdRecipe: extractJsonLdRecipe(html),
  };
}

type CaptionTrack = { baseUrl: string; languageCode: string; kind?: string };

async function fetchTranscript(tracks: CaptionTrack[]): Promise<string | null> {
  const track =
    tracks.find((t) => t.languageCode === "ja" && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === "ja") ??
    tracks[0];
  if (!track) return null;
  try {
    const xml = await fetchText(track.baseUrl);
    const lines = [...xml.matchAll(/<(?:text|p)[^>]*>([\s\S]*?)<\/(?:text|p)>/g)].map((m) =>
      decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim(),
    );
    const text = lines.filter(Boolean).join("\n");
    return text || null;
  } catch {
    // 字幕はサーバーからだと取れないことがある。概要欄だけで続行する
    return null;
  }
}

type VideoInfo = { title: string; description: string; tracks: CaptionTrack[] };

/** YouTube Data API で取得する。データセンター（Vercel）からでもブロックされない */
async function fetchVideoViaApi(videoId: string): Promise<VideoInfo | null> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  try {
    const api = new URL("https://www.googleapis.com/youtube/v3/videos");
    api.searchParams.set("part", "snippet");
    api.searchParams.set("id", videoId);
    api.searchParams.set("key", key);
    const res = await fetch(api, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.error("YouTube Data API error", res.status, await res.text());
      return null;
    }
    const snippet = (await res.json()).items?.[0]?.snippet;
    if (!snippet) return null;
    // 字幕の取得には OAuth が必要なので API では取らない
    return { title: snippet.title ?? "", description: snippet.description ?? "", tracks: [] };
  } catch (err) {
    console.error("YouTube Data API error", err);
    return null;
  }
}

/** 動画ページを直接読む。サーバーの IP によってはボット判定されて中身が返らない */
async function fetchVideoViaPage(videoId: string): Promise<VideoInfo> {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const html = await fetchText(watchUrl, { cookie: "CONSENT=YES+1" });

  const m = /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;\s*(?:var\s|<\/script>)/.exec(html);
  if (m) {
    try {
      const player = JSON.parse(m[1]);
      return {
        title: player.videoDetails?.title ?? metaContent(html, "og:title") ?? "",
        description: player.videoDetails?.shortDescription ?? "",
        tracks: player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [],
      };
    } catch {
      // YouTube 側の形式が変わっていても、メタタグの情報で続行する
    }
  }
  return {
    title: metaContent(html, "og:title") ?? "",
    description: metaContent(html, "og:description") ?? "",
    tracks: [],
  };
}

// レシピではないことが明らかなリンク先（通販・SNS など）
const NON_RECIPE_HOSTS =
  /(^|\.)(amazon\.[a-z.]+|amzn\.to|amzn\.asia|rakuten\.co\.jp|youtube\.com|youtu\.be|instagram\.com|tiktok\.com|twitter\.com|x\.com|facebook\.com|line\.me|lin\.ee|linktr\.ee|note\.com)$/i;

/** 概要欄の「詳しい作り方はこちら↓」のようなリンクを探す */
export function findRecipeLink(description: string): string | null {
  const lines = description.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const raw of lines[i].match(/https?:\/\/[^\s）)」』]+/g) ?? []) {
      if (!URL.canParse(raw)) continue;
      if (NON_RECIPE_HOSTS.test(new URL(raw).hostname)) continue;
      const context = `${lines[i - 1] ?? ""} ${lines[i]}`;
      if (/作り方|レシピ|recipe/i.test(context)) return raw;
    }
  }
  return null;
}

async function fetchLinkedRecipe(description: string): Promise<string | null> {
  const link = findRecipeLink(description);
  if (!link) return null;
  try {
    const page = await fetchWeb(link);
    const body = page.jsonLdRecipe ? JSON.stringify(page.jsonLdRecipe) : page.text.slice(0, 20_000);
    return `【概要欄のリンク先ページ】${link}\nタイトル: ${page.title}\n${body}`;
  } catch {
    // リンク先が読めなくても概要欄だけで続行する
    return null;
  }
}

async function fetchYoutube(url: string, videoId: string): Promise<SourceContent> {
  const info = (await fetchVideoViaApi(videoId)) ?? (await fetchVideoViaPage(videoId));
  if (!info.description && !info.title) {
    throw new Error("YouTube から動画の情報を取得できませんでした。少し時間をおくか、手入力で登録してください");
  }

  const [transcript, linked] = await Promise.all([
    fetchTranscript(info.tracks),
    fetchLinkedRecipe(info.description),
  ]);
  const text = [
    `【動画タイトル】\n${info.title}`,
    `【概要欄】\n${info.description || "（なし）"}`,
    transcript ? `【字幕】\n${transcript}` : null,
    linked,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    kind: "youtube",
    url,
    title: info.title,
    imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
    text,
    jsonLdRecipe: null,
  };
}

export async function fetchSource(url: string): Promise<SourceContent> {
  const videoId = youtubeVideoId(url);
  return videoId ? fetchYoutube(url, videoId) : fetchWeb(url);
}
