import { CalendarSkeleton } from "@/components/skeletons";
import { PageHeader } from "@/components/ui";

export default function Loading() {
  return (
    <>
      <PageHeader title="献立" />
      <CalendarSkeleton />
    </>
  );
}
