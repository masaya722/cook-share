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

async function fetchYoutube(url: string, videoId: string): Promise<SourceContent> {
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const html = await fetchText(watchUrl, { cookie: "CONSENT=YES+1" });

  let title = metaContent(html, "og:title") ?? "";
  let description = "";
  let tracks: CaptionTrack[] = [];

  const m = /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;\s*(?:var\s|<\/script>)/.exec(html);
  if (m) {
    try {
      const player = JSON.parse(m[1]);
      title = player.videoDetails?.title ?? title;
      description = player.videoDetails?.shortDescription ?? "";
      tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
    } catch {
      // YouTube 側の形式が変わっていても、メタタグの情報で続行する
    }
  }
  if (!description) description = metaContent(html, "og:description") ?? "";

  const transcript = await fetchTranscript(tracks);
  const text = [
    `【動画タイトル】\n${title}`,
    `【概要欄】\n${description || "（なし）"}`,
    transcript ? `【字幕】\n${transcript}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    kind: "youtube",
    url,
    title,
    imageUrl: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
    text,
    jsonLdRecipe: null,
  };
}

export async function fetchSource(url: string): Promise<SourceContent> {
  const videoId = youtubeVideoId(url);
  return videoId ? fetchYoutube(url, videoId) : fetchWeb(url);
}
