"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Spinner, buttonClass, inputClass } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    if (error) {
      setError("メールアドレスかパスワードが違います");
      setLoading(false);
      return;
    }
    const next = searchParams.get("next");
    // next は /share（Route Handler）のこともあるので、クライアント遷移ではなく通常の遷移にする
    window.location.replace(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input
        type="email"
        autoComplete="email"
        placeholder="メールアドレス"
        className={inputClass}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        type="password"
        autoComplete="current-password"
        placeholder="パスワード"
        className={inputClass}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="text-sm text-accent">{error}</p>}
      <button type="submit" className={`${buttonClass} py-3`} disabled={loading}>
        {loading && <Spinner />}
        {loading ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-bold">うちのレシピ</h1>
      <p className="mb-8 text-sm text-muted">夫婦で共有するレシピ帳</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
