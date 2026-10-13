import { DomainError } from "../shared/domain-error";

export type SourceKind = "youtube" | "web" | "manual";

/** 出典: レシピの元になった YouTube 動画や Web ページ。手入力なら URL はない */
export type Source = {
  readonly kind: SourceKind;
  readonly url: string | null;
};

export const Source = {
  /** R7: 出典の URL は http:// か https:// で始まる（画面でリンクにするため、それ以外は受け付けない） */
  of(kind: SourceKind, url: string | null | undefined): Source {
    const trimmed = url?.trim() || null;
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      throw new DomainError("元の URL は http:// か https:// で始まる必要があります");
    }
    return { kind, url: trimmed };
  },

  manual(): Source {
    return { kind: "manual", url: null };
  },
};
