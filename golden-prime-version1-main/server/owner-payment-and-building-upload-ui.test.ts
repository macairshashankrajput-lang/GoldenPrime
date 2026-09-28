import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Owner-payment deletion and Building image upload contracts", () => {
  it("makes every historical Owner payment removable through the existing audited deletion flow", () => {
    const profit = source("client/src/pages/Profit.tsx");
    expect(profit).toContain("Owner payment for ${item.billingMonth}");
    expect(profit).toContain("deleteSettlement.mutate({ buildingId, id: item.id })");
    expect(profit).toContain("10-minute audit-backed undo");
  });

  it("accepts and uploads Building profile photos through the managed image path", () => {
    const pg = source("server/routers/pg.ts");
    const buildings = source("client/src/pages/Buildings.tsx");
    const uploader = source("server/imageUpload.ts");
    expect(pg).toContain('z.enum(["building", "room", "meter", "receipt", "payment_qr"])');
    expect(buildings).toContain('purpose: "building"');
    expect(buildings).toContain('name="propertyPhoto"');
    expect(uploader).toContain('"building" | "room" | "meter" | "receipt" | "payment_qr"');
  });
});
