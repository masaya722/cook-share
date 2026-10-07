/**
 * 暦の日付（YYYY-MM-DD）。時刻やタイムゾーンを持たない。
 * 「今日」は端末のローカル日付で決め、ドメインには日付として渡す。
 */
export type CalendarDate = string & { readonly __brand: "CalendarDate" };

const PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): value is CalendarDate {
  if (!PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function calendarDate(value: string): CalendarDate {
  if (!isCalendarDate(value)) throw new Error(`日付の形式が正しくありません: ${value}`);
  return value;
}

export function fromLocalDate(d: Date): CalendarDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}` as CalendarDate;
}

function toLocalDate(value: CalendarDate): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(value: CalendarDate, days: number): CalendarDate {
  const d = toLocalDate(value);
  d.setDate(d.getDate() + days);
  return fromLocalDate(d);
}

/** a が b より前なら負、同じなら 0、後なら正 */
export function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 0 = 日曜 … 6 = 土曜 */
export function weekday(value: CalendarDate): number {
  return toLocalDate(value).getDay();
}
