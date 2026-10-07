"use client";

/** 作る人数の −/+ */
export function ServingsStepper({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const button = "pressable flex h-7 w-7 items-center justify-center rounded-full border border-border text-base disabled:opacity-40";
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        className={button}
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 1}
        aria-label="作る人数を減らす"
      >
        −
      </button>
      <span className="min-w-12 text-center text-sm tabular-nums">{value}人分</span>
      <button
        type="button"
        className={button}
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= 20}
        aria-label="作る人数を増やす"
      >
        ＋
      </button>
    </span>
  );
}
