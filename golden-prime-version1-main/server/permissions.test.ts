import { describe, expect, it } from "vitest";
import { canCreateExpense, hasRolePermission } from "./permissions";

describe("role permissions", () => {
  it("limits the Owner to the dedicated read-only summary contract", () => {
    expect(hasRolePermission("admin", "manageStaff")).toBe(false);
    expect(hasRolePermission("admin", "export")).toBe(false);
    expect(hasRolePermission("admin", "manageBuildings")).toBe(false);
    expect(hasRolePermission("admin", "manageRent")).toBe(false);
  });

  it("gives a delegated Manager every operational permission", () => {
    ["read", "manageBuildings", "manageRooms", "manageTenants", "manageRent", "manageElectricity", "manageExpenses", "manageReminders", "manageStaff", "export"].forEach(action => {
      expect(hasRolePermission("manager", action as Parameters<typeof hasRolePermission>[1])).toBe(true);
    });
    expect(hasRolePermission("helper", "manageElectricity")).toBe(true);
    expect(hasRolePermission("helper", "manageRent")).toBe(false);
  });

  it("keeps destructive building and room operations manager-authorized but tenant-forbidden", () => {
    expect(hasRolePermission("manager", "manageBuildings")).toBe(true);
    expect(hasRolePermission("manager", "manageRooms")).toBe(true);
    expect(hasRolePermission("tenant", "manageBuildings")).toBe(false);
    expect(hasRolePermission("tenant", "manageRooms")).toBe(false);
  });

  it("allows a Cook to log only food-related expenses", () => {
    expect(canCreateExpense("cook", "groceries")).toBe(true);
    expect(canCreateExpense("cook", "tiffin")).toBe(true);
    expect(canCreateExpense("cook", "salaries")).toBe(false);
  });
});
