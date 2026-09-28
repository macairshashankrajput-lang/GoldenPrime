import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveOperatingCostStatus } from "./db";

describe("Manager operating costs", () => {
  it("derives pending, partial, and settled payment status from the recorded payable balance", () => {
    expect(deriveOperatingCostStatus(100000, 0)).toBe("pending");
    expect(deriveOperatingCostStatus(100000, 25000)).toBe("partial");
    expect(deriveOperatingCostStatus(100000, 100000)).toBe("paid");
  });

  it("keeps paid costs in cash results while deducting the full committed cost from projected profit", () => {
    const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(source).toContain("monthlyExpensePaise: monthlyExpensePaise + monthlyOperatingCostPaidPaise");
    expect(source).toContain("monthlyExpensePaise: monthlyExpensePaise + monthlyOperatingCostPaise");
    expect(source).toContain("monthlyOperatingCostPayablePaise: Math.max(monthlyOperatingCostPaise - monthlyOperatingCostPaidPaise, 0)");
  });
});
