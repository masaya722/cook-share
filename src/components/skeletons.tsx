import { PageHeader, Skeleton } from "./ui";

export function RecipeGridSkeleton() {
  return (
    <>
      <Skeleton className="h-11" />
      <div className="mt-3 flex gap-2">
        {[14, 12, 16, 12].map((w, i) => (
          <Skeleton key={i} className="h-8 rounded-full" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
            <Skeleton className="aspect-[4/3] rounded-none" />
            <div className="flex flex-col gap-1.5 p-2.5">
              <Skeleton className="h-4" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function RecipeDetailSkeleton() {
  return (
    <>
      <PageHeader title="" back="/" />
      <Skeleton className="-mx-4 aspect-video rounded-none sm:mx-0 sm:rounded-2xl" />
      <Skeleton className="mt-4 h-8 w-4/5" />
      <Skeleton className="mt-3 h-4" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
      <Skeleton className="mt-6 h-6 w-16" />
      <Skeleton className="mt-2 h-48 rounded-2xl" />
    </>
  );
}

export function FormSkeleton({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-col gap-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-11" />
          </div>
        ))}
      </div>
    </>
  );
}

export function CalendarSkeleton() {
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-20 rounded-full" />
      </div>
      <ul className="flex flex-col gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <li key={i} className="flex items-center justify-between rounded-2xl border border-border bg-surface p-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-6 w-36 rounded-full" />
          </li>
        ))}
      </ul>
    </>
  );
}

export function ShoppingRowsSkeleton() {
  return (
    <div className="mt-5 flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-5 w-5 rounded-md" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-12" />
        </div>
      ))}
    </div>
  );
}

export function ShoppingSkeleton() {
  return (
    <>
      <div className="flex gap-2">
        <Skeleton className="h-11 flex-[3]" />
        <Skeleton className="h-11 flex-[2]" />
        <Skeleton className="h-10 w-12 rounded-full" />
      </div>
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-16 rounded-full" />
        ))}
      </div>
      <ShoppingRowsSkeleton />
    </>
  );
}
