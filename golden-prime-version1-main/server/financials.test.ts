import { describe, expect, it } from "vitest";
import { calculateBuildingFinancials, calculateManagerOperatingResult, getDashboardPeriod } from "./domain";

describe("building financial totals", () => {
  it("keeps collected cash separate from expected service charges", () => {
    expect(calculateBuildingFinancials({ expectedRentPaise: 1500000, collectedRentPaise: 1200000, monthlyExpensePaise: 300000, monthlyServiceChargeExpectedPaise: 200000 })).toEqual({ outstandingRentPaise: 300000, cashOperatingResultPaise: 900000, projectedOperatingResultPaise: 1400000 });
  });

  it("deducts a recorded Owner settlement once from the cash operating result", () => {
    expect(calculateBuildingFinancials({ expectedRentPaise: 1800000, collectedRentPaise: 1800000, monthlyExpensePaise: 300000, monthlyServiceChargeExpectedPaise: 0, ownerSettlementPaidPaise: 500000 })).toEqual({ outstandingRentPaise: 0, cashOperatingResultPaise: 1000000, projectedOperatingResultPaise: 1500000 });
  });

  it("never returns a negative outstanding rent after an overpayment", () => {
    expect(calculateBuildingFinancials({ expectedRentPaise: 100000, collectedRentPaise: 125000, monthlyExpensePaise: 0, monthlyServiceChargeExpectedPaise: 0 }).outstandingRentPaise).toBe(0);
  });

  it("deducts the configured Owner share from the projected operating result", () => {
    expect(calculateManagerOperatingResult(1400000, 15)).toEqual({ ownerCutPaise: 210000, managerOperatingResultPaise: 1190000 });
  });
});

describe("dashboard reporting periods", () => {
  it("uses a calendar month or a full calendar year as a stable aggregation key", () => {
    const reference = new Date("2026-08-23T00:00:00.000Z");
    expect(getDashboardPeriod("monthly", reference)).toEqual({ key: "2026-08", label: "August 2026" });
    expect(getDashboardPeriod("yearly", reference)).toEqual({ key: "2026", label: "2026" });
  });

  it("uses a selected historical month or year and rejects invalid period keys", () => {
    const reference = new Date("2026-08-23T00:00:00.000Z");
    expect(getDashboardPeriod("monthly", reference, "2025-04")).toEqual({ key: "2025-04", label: "April 2025" });
    expect(getDashboardPeriod("yearly", reference, "2024")).toEqual({ key: "2024", label: "2024" });
    expect(() => getDashboardPeriod("monthly", reference, "2025-13")).toThrow("valid reporting month");
    expect(() => getDashboardPeriod("yearly", reference, "2025-04")).toThrow("valid reporting month");
  });
});
