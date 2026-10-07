import { ShoppingList } from "@/components/shopping-list";
import { PageHeader } from "@/components/ui";

export default function ShoppingPage() {
  return (
    <>
      <PageHeader title="買い物リスト" />
      <ShoppingList />
    </>
  );
}
