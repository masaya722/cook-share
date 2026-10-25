/** 写真から取り込むときの画像の保存場所（Supabase Storage のバケット） */
export const RECIPE_IMAGE_BUCKET = "recipe-images";

/** 1 つのレシピとして一度に読み取る画像の上限 */
export const MAX_IMAGES = 5;

/** アップロードした画像のファイル名（ランダムな UUID ＋ 拡張子）。これ以外の URL は読み取りに使わない */
export const UPLOADED_IMAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;
