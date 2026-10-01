"use client";

import { useToday } from "@/lib/use-today";
import { ShoppingList } from "./shopping-list";

export function DefaultShoppingRange() {
  const t = useToday();
  return t ? <ShoppingList from={t} to={t} /> : null;
}
