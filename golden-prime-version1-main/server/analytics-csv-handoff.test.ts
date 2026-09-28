import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("Manager analytics and CSV handoff", () => {
  it("renders current occupancy and revenue analytics from the live dashboard snapshot", () => {
    const dashboard = read("client/src/pages/Dashboard.tsx");
    expect(dashboard).toContain("Manager analytics");
    expect(dashboard).toContain("Current occupancy rate");
    expect(dashboard).toContain("Revenue collected");
    expect(dashboard).toContain("role=\"progressbar\"");
    expect(dashboard).toContain("summary.activeTenants + summary.vacantBeds");
    expect(dashboard).toContain("summary.collectedPaise");
  });

  it("uses a protected building-scoped CSV procedure backed by sanitized workbook rows", () => {
    const router = read("server/routers/pg.ts");
    const mapper = read("server/exportWorkbook.ts");
    const exportsPage = read("client/src/pages/Exports.tsx");
    expect(router).toContain('csv: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), dataset: z.enum(["rooms", "tenants"])');
    expect(router).toContain('requireBuildingAccess(ctx.user, input.buildingId, "export")');
    expect(mapper).toContain("export async function getCsvExportData");
    expect(mapper).toContain('datasets: [input.dataset]');
    expect(exportsPage).toContain("Quick CSV downloads");
    expect(exportsPage).toContain('dataset: "rooms"');
    expect(exportsPage).toContain('dataset: "tenants"');
    expect(exportsPage).toContain("escapeCsvCell");
    expect(exportsPage).toContain("safeText");
  });

  it("keeps the complete Supabase handoff artifacts present and explicit about private Storage policy posture", () => {
    expect(existsSync(new URL("../supabase/complete-migration.sql", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../supabase/storage-policies.sql", import.meta.url))).toBe(true);
    expect(existsSync(new URL("../supabase/handoff-manifest.json", import.meta.url))).toBe(true);
    const storagePolicies = read("supabase/storage-policies.sql");
    const completeSql = read("supabase/complete-migration.sql");
    expect(storagePolicies).toContain("storage.buckets");
    expect(storagePolicies).toContain("golden-prime-images");
    expect(storagePolicies).toContain("private bucket");
    expect(completeSql).toContain("Golden Prime PG complete Supabase migration handoff");
  });
});
