import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Supabase image storage contract", () => {
  it("uses a private, server-keyed Supabase bucket and preserves managed image URLs", () => {
    const storage = source("server/supabaseStorage.ts");
    const uploader = source("server/imageUpload.ts");
    const proxy = source("server/_core/storageProxy.ts");

    expect(storage).toContain('const IMAGE_BUCKET = "golden-prime-images"');
    expect(storage).toContain("process.env.SUPABASE_SECRET_KEY");
    expect(storage).toContain("createSignedUrl(objectKey, 60)");
    expect(uploader).toContain("uploadGoldenPrimeImage");
    expect(proxy).toContain('key.startsWith("supabase/")');
    expect(proxy).toContain("createGoldenPrimeImageSignedUrl(key)");
  });

  it("maps missing objects to 404 and keeps PWA icons local to the static build", () => {
    const storage = source("server/supabaseStorage.ts");
    const proxy = source("server/_core/storageProxy.ts");
    const html = source("client/index.html");
    const vite = source("vite.config.ts");
    const buildings = source("client/src/pages/Buildings.tsx");
    expect(storage).toContain("isMissingStorageObject");
    expect(storage).toContain("if (error && isMissingStorageObject(error)) return null");
    expect(proxy).toContain('res.status(404).send("Storage object not found")');
    expect(html).toContain("/golden-prime-icon-192.png");
    expect(html).not.toContain("/manus-storage/pwa-");
    expect(vite).toContain("/golden-prime-icon-512.png");
    expect(vite).not.toContain("/manus-storage/pwa-");
    expect(buildings).toContain('const buildingPlaceholder = "/building-placeholder.svg"');
    expect(buildings).not.toContain("/manus-storage/golden-prime-building_");
  });

  it("bounds the application pool below the managed Supabase session limit", () => {
    const db = source("server/db.ts");
    const auth = source("server/auth.ts");
    expect(db).toContain("SUPABASE_POOL_MAX");
    expect(db).toContain("max,");
    expect(auth).toContain("isTransientDatabaseError");
    expect(auth).toContain("attempt < 3");
  });
});
