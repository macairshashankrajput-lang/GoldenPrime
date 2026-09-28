import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getDefaultBillingModeForRoomType, getRoomCapacityForType } from "./domain";

describe("Individual and Co-living room billing contracts", () => {
  it("uses Manager-controlled capacity for Individual rooms and fixed couple capacity for Co-living", () => {
    expect(getRoomCapacityForType("individual", 7)).toBe(7);
    expect(getRoomCapacityForType("individual", 99)).toBe(12);
    expect(getRoomCapacityForType("coliving", 9)).toBe(2);
  });

  it("assigns safe billing defaults by room type", () => {
    expect(getDefaultBillingModeForRoomType("individual")).toBe("manager_set");
    expect(getDefaultBillingModeForRoomType("coliving")).toBe("primary_payer");
    expect(getDefaultBillingModeForRoomType("double")).toBe("equal_split");
  });

  it("persists a primary-payer flag and avoids automatic bills for Manager-set individual rooms", () => {
    const schema = readFileSync(resolve(process.cwd(), "drizzle-pg/schema.ts"), "utf8");
    const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
    expect(schema).toContain('"individual", "coliving"');
    expect(schema).toContain('billingMode: roomBillingMode("roomBillingMode")');
    expect(schema).toContain('isPrimaryPayer: allocationPrimaryPayer("allocationPrimaryPayer")');
    expect(db).toContain('allocation.billingMode !== "primary_payer" || allocation.isPrimaryPayer === "yes"');
    expect(db).toContain('if (!room || room.billingMode === "manager_set")');
  });
});
