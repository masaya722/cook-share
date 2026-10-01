import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "うちのレシピ",
    short_name: "レシピ",
    description: "夫婦で共有するレシピ帳",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf7f2",
    theme_color: "#fbf7f2",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android の「共有」メニューに表示される（iOS は Web Share Target 非対応）
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  } as MetadataRoute.Manifest;
}
