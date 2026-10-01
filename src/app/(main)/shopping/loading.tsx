import { ShoppingSkeleton } from "@/components/skeletons";
import { PageHeader } from "@/components/ui";

export default function Loading() {
  return (
    <>
      <PageHeader title="買い物リスト" />
      <ShoppingSkeleton />
    </>
  );
}
