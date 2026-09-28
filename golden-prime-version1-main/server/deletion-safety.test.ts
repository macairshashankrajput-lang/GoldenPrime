import { describe, expect, it } from "vitest";
import { getBuildingDeletionBlockReason, getFloorDeletionBlockReason, getRoomDeletionBlockReason, getTenantDeletionBlockReason } from "./db";

describe("deletion safety", () => {
  it("allows an entirely empty building to be deleted", () => {
    expect(getBuildingDeletionBlockReason({ floors: 0, rooms: 0, tenants: 0, allocations: 0, rentPayments: 0, electricityBills: 0, expenses: 0, reminders: 0 })).toBeNull();
  });

  it("protects a building that has operational records", () => {
    expect(getBuildingDeletionBlockReason({ floors: 1, rooms: 0, tenants: 0, allocations: 0, rentPayments: 0, electricityBills: 0, expenses: 0, reminders: 0 })).toContain("operational records");
  });

  it("protects floors that still contain rooms", () => {
    expect(getFloorDeletionBlockReason(1)).toContain("rooms are assigned");
    expect(getFloorDeletionBlockReason(0)).toBeNull();
  });

  it("protects rooms with allocation or electricity history", () => {
    expect(getRoomDeletionBlockReason({ allocations: 1, electricityBills: 0 })).toContain("tenant allocations");
    expect(getRoomDeletionBlockReason({ allocations: 0, electricityBills: 1 })).toContain("electricity bills");
    expect(getRoomDeletionBlockReason({ allocations: 0, electricityBills: 0 })).toBeNull();
  });

  it("protects tenants with allocation, rent, or reminder history", () => {
    expect(getTenantDeletionBlockReason({ allocations: 1, rentPayments: 0, electricityBills: 0, reminders: 0 })).toContain("Offboard tenant");
    expect(getTenantDeletionBlockReason({ allocations: 0, rentPayments: 1, electricityBills: 0, reminders: 0 })).toContain("Offboard tenant");
    expect(getTenantDeletionBlockReason({ allocations: 0, rentPayments: 0, electricityBills: 1, reminders: 0 })).toContain("Offboard tenant");
    expect(getTenantDeletionBlockReason({ allocations: 0, rentPayments: 0, electricityBills: 0, reminders: 1 })).toContain("Offboard tenant");
    expect(getTenantDeletionBlockReason({ allocations: 0, rentPayments: 0, electricityBills: 0, reminders: 0 })).toBeNull();
  });
});

export {};
