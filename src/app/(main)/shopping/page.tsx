import { DefaultShoppingRange } from "@/components/default-shopping-range";
import { ShoppingList } from "@/components/shopping-list";
import { PageHeader } from "@/components/ui";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  return (
    <>
      <PageHeader title="買い物リスト" />
      {from && to && DATE_KEY.test(from) && DATE_KEY.test(to) ? (
        <ShoppingList from={from} to={to} />
      ) : (
        // 「今日」はサーバーではなく端末の日付で決めたいので、クライアントで補う
        <DefaultShoppingRange />
      )}
    </>
  );
}
