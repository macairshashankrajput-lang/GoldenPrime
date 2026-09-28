import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PWA install and offline support", () => {
  it("configures an installable manifest with the required icon sizes", () => {
    const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    expect(viteConfig).toContain('VitePWA({');
    expect(viteConfig).toContain('name: "Golden Prime PG"');
    expect(viteConfig).toContain('sizes: "192x192"');
    expect(viteConfig).toContain('sizes: "512x512"');
    expect(viteConfig).toContain('display: "standalone"');
  });

  it("keeps authenticated API responses out of navigation fallback caching", () => {
    const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
    expect(viteConfig).toContain('navigateFallback: "/index.html"');
    expect(viteConfig).toContain("navigateFallbackDenylist: [/^\\/api\\//]");
  });

  it("registers PWA lifecycle notices for offline use, updates, and browser installation", () => {
    const lifecycleSource = readFileSync(new URL("../client/src/components/PwaLifecycle.tsx", import.meta.url), "utf8");
    const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    const htmlSource = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
    expect(lifecycleSource).toContain('registerSW({');
    expect(lifecycleSource).toContain("beforeinstallprompt");
    expect(lifecycleSource).toContain("onOfflineReady");
    expect(lifecycleSource).toContain("onNeedRefresh");
    expect(appSource).toContain("<PwaLifecycle />");
    expect(htmlSource).toContain('rel="apple-touch-icon"');
  });
});
