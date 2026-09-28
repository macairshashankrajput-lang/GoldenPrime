import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel deployment contract", () => {
  it("builds the client and exposes the authenticated API and managed storage paths locally", () => {
    const packageJson = readFileSync(resolve(process.cwd(), "package.json"), "utf8");
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    const api = readFileSync(resolve(process.cwd(), "api/[...path].ts"), "utf8");

    expect(packageJson).toContain('"vercel:build": "vite build"');
    expect(config.outputDirectory).toBe("dist/public");
    expect(config.rewrites).toEqual(expect.arrayContaining([expect.objectContaining({ source: "/(.*)", destination: "/index.html" })]));
    expect(api).toContain('import { createApp } from "../server/_core/app"');
    expect(api).toContain("export default createApp()");

  });
});
