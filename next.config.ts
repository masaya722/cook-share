import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 一度開いた画面は 30 秒間、端末側のキャッシュから即表示する（保存・削除時は router.refresh で更新）
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
