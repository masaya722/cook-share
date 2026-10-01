import Link from "next/link";

export function PageHeader({
  title,
  back,
  action,
}: {
  title: string;
  back?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex min-h-10 items-center gap-2">
      {back && (
        <Link href={back} aria-label="戻る" className="-ml-2 rounded-full p-2 text-muted">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      )}
      <h1 className="flex-1 truncate text-xl font-bold">{title}</h1>
      {action}
    </header>
  );
}

export const buttonClass =
  "inline-flex items-center justify-center gap-1 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50";

export const subtleButtonClass =
  "inline-flex items-center justify-center gap-1 rounded-full border border-border bg-surface px-4 py-2 text-sm disabled:opacity-50";

export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 outline-none focus:border-accent";
