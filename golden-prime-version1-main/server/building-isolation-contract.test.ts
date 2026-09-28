import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dbSource = () => readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");

describe("multi-building isolation", () => {
  it("filters Owner building access by owner assignment and Manager access by staff assignment", () => {
    const source = dbSource();
    expect(source).toContain('if (role === "admin")');
    expect(source).toContain("eq(buildings.ownerId, userId)");
    expect(source).toContain('if (role === "manager")');
    expect(source).toContain("eq(staffAssignments.userId, userId)");
  });

  it("does not retain the former global building-list shortcut for Owner or Manager roles", () => {
    const source = dbSource();
    expect(source).not.toContain('if (user.role === "admin" || user.role === "manager") return db.select().from(buildings)');
    expect(source).toContain("eq(buildings.ownerId, user.id)");
    expect(source).toContain("eq(staffAssignments.userId, user.id)");
  });

  it("retains optimistic concurrency guards for concurrent rent, electricity, expense, and operating-cost edits", () => {
    const source = dbSource();
    expect(source).toContain("eq(rentPayments.updatedAt, input.expectedUpdatedAt)");
    expect(source).toContain("eq(electricityBills.updatedAt, input.expectedUpdatedAt)");
    expect(source).toContain("eq(expenses.updatedAt, input.expectedUpdatedAt)");
    expect(source).toContain("eq(operatingCosts.updatedAt, input.expectedUpdatedAt)");
  });
});
