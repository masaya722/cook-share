import { BottomNav } from "@/components/bottom-nav";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto max-w-2xl px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-28">
        {children}
      </main>
      <BottomNav />
    </>
  );
}
