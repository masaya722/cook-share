// ホーム画面へのインストールと Android の共有メニュー登録のための最小限の Service Worker。
// データは常に最新を見たいのでキャッシュはしない。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
