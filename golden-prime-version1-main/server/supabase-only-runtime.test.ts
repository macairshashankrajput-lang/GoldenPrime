import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Supabase-only runtime contract", () => {
  it("uses only the Supabase PostgreSQL connection in the active data layer", () => {
    const db = read("server/db.ts");
    const env = read("server/_core/env.ts");
    const drizzleConfig = read("drizzle.config.ts");
    expect(db).toContain('process.env.SUPABASE_DATABASE_URL');
    expect(db).toContain('drizzlePostgres');
    expect(db).not.toContain("mysql2");
    expect(db).not.toContain("process.env.DATABASE_URL");
    expect(env).not.toContain("DATABASE_URL");
    expect(drizzleConfig).toContain('dialect: "postgresql"');
    expect(drizzleConfig).toContain("drizzle-pg/schema.ts");
  });

  it("uses Supabase PostgreSQL for the retained end-to-end audit script", () => {
    const auditScript = read("scripts/reliability-e2e-audit.mjs");
    expect(auditScript).toContain('import pg from "pg"');
    expect(auditScript).toContain("SUPABASE_DATABASE_URL");
    expect(auditScript).not.toContain("mysql2");
    expect(auditScript).not.toContain("process.env.DATABASE_URL");
  });

  it("keeps the active PostgreSQL schema as the only application schema source", () => {
    const packageJson = read("package.json");
    expect(packageJson).not.toMatch(/\"mysql2\"\s*:/);
    expect(read("drizzle-pg/schema.ts")).toContain('from "drizzle-orm/pg-core"');
  });
});
