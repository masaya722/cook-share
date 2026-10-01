"use client";

import { useSyncExternalStore } from "react";
import { today } from "./date";

const subscribe = () => () => {};

/** 端末の日付（YYYY-MM-DD）。サーバーのタイムゾーンで描画しないよう、SSR 中は null */
export function useToday(): string | null {
  return useSyncExternalStore(subscribe, today, () => null);
}
