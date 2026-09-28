import { describe, expect, it } from "vitest";
import { assertTenantCanReceiveAllocation, calculateBuildingFinancials, calculateElectricityBill, calculateRoomRentTotal, calculateTransferProration, deriveRentStatus, deriveTenantChargeStatus, getRoomCapacityForType, getRoomOccupancy, isDateOverdue, splitPaiseEvenly } from "./domain";

describe("deriveRentStatus", () => {
  it("returns the exact pending, partial, and paid states", () => {
    expect(deriveRentStatus(100000, 0)).toBe("pending");
    expect(deriveRentStatus(100000, 55000)).toBe("partial");
    expect(deriveRentStatus(100000, 100000)).toBe("paid");
    expect(deriveRentStatus(100000, 125000)).toBe("paid");
  });

  it("rejects invalid rent amounts", () => {
    expect(() => deriveRentStatus(0, 0)).toThrow();
    expect(() => deriveRentStatus(100, -1)).toThrow();
  });
});

describe("calculateElectricityBill", () => {
  it("calculates consumed units and paise-based amount from readings", () => {
    expect(calculateElectricityBill(1200, 1287, 800)).toEqual({ unitsConsumed: 87, billAmountPaise: 69600 });
  });

  it("rejects declining meter readings", () => {
    expect(() => calculateElectricityBill(1200, 1199, 800)).toThrow();
  });
});

describe("shared tenant charge calculations", () => {
  it("splits room rent or electricity exactly with deterministic paise remainder handling", () => {
    expect(splitPaiseEvenly(1350000, 1)).toEqual([1350000]);
    expect(splitPaiseEvenly(1350001, 2)).toEqual([675001, 675000]);
    expect(splitPaiseEvenly(100, 3)).toEqual([34, 33, 33]);
  });

  it("rejects invalid sharing counts and classifies tenant charge settlement", () => {
    expect(() => splitPaiseEvenly(100, 0)).toThrow("active room occupant");
    expect(deriveTenantChargeStatus(50000, 0)).toBe("pending");
    expect(deriveTenantChargeStatus(50000, 12000)).toBe("partial");
    expect(deriveTenantChargeStatus(50000, 50000)).toBe("paid");
  });
});

describe("individual shared-room rent", () => {
  it("derives the room total from each tenant’s agreed rent without equalizing the rents", () => {
    expect(calculateRoomRentTotal([500000, 550000])).toBe(1050000);
    expect(calculateRoomRentTotal([500000, 525000, 550000, 575000])).toBe(2150000);
    expect(calculateRoomRentTotal([])).toBe(0);
  });

  it("rejects an invalid individual tenant rent", () => {
    expect(() => calculateRoomRentTotal([500000, 0])).toThrow("Each active tenant rent");
  });
});

describe("mid-month transfer rent proration", () => {
  it("calculates source and destination due amounts in whole paise from the effective transfer date", () => {
    expect(calculateTransferProration(3100000, 6200000, "2026-08-16")).toEqual({ rentMonth: "2026-08", daysInMonth: 31, sourceDays: 15, destinationDays: 16, sourceExpectedAmountPaise: 1500000, destinationExpectedAmountPaise: 3200000 });
  });

  it("requires a genuine mid-month date and positive monthly rents", () => {
    expect(() => calculateTransferProration(3100000, 6200000, "2026-08-01")).toThrow("after the first day");
    expect(() => calculateTransferProration(0, 6200000, "2026-08-16")).toThrow("positive whole numbers");
  });
});

describe("getRoomOccupancy", () => {
  it("derives real-time vacancy from active allocation count", () => {
    expect(getRoomOccupancy(3, 0)).toEqual({ status: "vacant", availableBeds: 3, isFull: false });
    expect(getRoomOccupancy(3, 2)).toEqual({ status: "occupied", availableBeds: 1, isFull: false });
    expect(getRoomOccupancy(3, 3)).toEqual({ status: "occupied", availableBeds: 0, isFull: true });
  });
});

describe("room sharing capacity", () => {
  it("derives allocation capacity from the selected sharing type", () => {
    expect(getRoomCapacityForType("single")).toBe(1);
    expect(getRoomCapacityForType("double")).toBe(2);
    expect(getRoomCapacityForType("triple")).toBe(3);
    expect(getRoomCapacityForType("four")).toBe(4);
  });
});

describe("active allocation integrity", () => {
  it("allows a tenant to be allocated only after no active allocation remains", () => {
    expect(() => assertTenantCanReceiveAllocation(0)).not.toThrow();
    expect(() => assertTenantCanReceiveAllocation(1)).toThrow("only one active room allocation");
  });
});

describe("isDateOverdue", () => {
  it("identifies dates before the current date without timezone drift", () => {
    expect(isDateOverdue("2026-08-20", "2026-08-21")).toBe(true);
    expect(isDateOverdue("2026-08-21", "2026-08-21")).toBe(false);
  });
});

describe("building financial reconciliation", () => {
  it("offsets paid and expected tenant-assigned cost recoveries against the respective cash and projected results", () => {
    expect(calculateBuildingFinancials({ expectedRentPaise: 3000000, collectedRentPaise: 2100000, monthlyExpensePaise: 1000000, monthlyServiceChargeExpectedPaise: 200000, expectedTenantChargeRecoveryPaise: 300000, collectedTenantChargeRecoveryPaise: 120000 })).toEqual({ outstandingRentPaise: 900000, cashOperatingResultPaise: 1220000, projectedOperatingResultPaise: 2500000 });
  });
});
