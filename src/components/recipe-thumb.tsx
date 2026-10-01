/* eslint-disable @next/next/no-img-element -- 外部サイトのサムネイルをそのまま表示する */
import type { SourceType } from "@/lib/types";

export function RecipeThumb({
  src,
  sourceType,
  className = "",
}: {
  src: string | null;
  sourceType?: SourceType;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden bg-accent-soft ${className}`}>
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-accent/60">
          <svg viewBox="0 0 24 24" className="h-1/3 w-1/3" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M3 11h18a9 9 0 0 1-18 0ZM8 7c0-1 1-1 1-2M12 7c0-1 1-1 1-2M16 7c0-1 1-1 1-2" strokeLinecap="round" />
          </svg>
        </div>
      )}
      {sourceType === "youtube" && (
        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
          ▶ YouTube
        </span>
      )}
    </div>
  );
}
