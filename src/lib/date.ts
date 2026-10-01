const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 端末のローカル時刻で YYYY-MM-DD を返す（toISOString は UTC になるので使わない） */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function today(): string {
  return toDateKey(new Date());
}

/** 例: 10/3 (金) */
export function formatShort(key: string): string {
  const d = fromDateKey(key);
  return `${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS[d.getDay()]})`;
}

export function weekdayIndex(key: string): number {
  return fromDateKey(key).getDay();
}
