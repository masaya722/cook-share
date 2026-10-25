import { createClient } from "@/lib/supabase/client";
import { RECIPE_IMAGE_BUCKET } from "./images";

/** 長辺をこの大きさに縮める（料理本のページの文字が読める程度） */
const MAX_EDGE = 1600;

async function loadImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // 読めない形式は <img> で読み直す
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 送る前にスマホ側で縮小して JPEG にする（料理本の写真は 1 枚数 MB あるため） */
export async function shrinkImage(file: File): Promise<Blob> {
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("画像を読み込めませんでした"))), "image/jpeg", 0.85),
  );
}

/**
 * 写真を縮小して画像の保存場所にアップロードし、公開 URL を返す（選んだ順）。
 * 名前は推測できないランダムな UUID にする（URL を知っている人だけが見られる）。
 */
export async function uploadRecipeImages(files: File[]): Promise<string[]> {
  const storage = createClient().storage.from(RECIPE_IMAGE_BUCKET);
  return Promise.all(
    files.map(async (file) => {
      const path = `${crypto.randomUUID()}.jpg`;
      const { error } = await storage.upload(path, await shrinkImage(file), {
        contentType: "image/jpeg",
        cacheControl: "31536000",
      });
      if (error) throw new Error("写真をアップロードできませんでした");
      return storage.getPublicUrl(path).data.publicUrl;
    }),
  );
}
