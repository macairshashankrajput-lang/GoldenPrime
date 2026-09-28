import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("concurrent operational safety contracts", () => {
  it("keeps allocation move-outs scoped to the selected building in persistence", () => {
    const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(source).toContain("eq(roomAllocations.buildingId, input.buildingId)");
    expect(source).toContain("eq(roomAllocations.status, \"active\")");
  });

  it("enforces database-level uniqueness for monthly rent and electricity records", () => {
    const source = readFileSync(new URL("../drizzle-pg/schema.ts", import.meta.url), "utf8");
    expect(source).toContain('uniqueIndex("rent_allocation_month_unique")');
    expect(source).toContain('uniqueIndex("electricity_room_month_unique")');
    expect(source).toContain('uniqueIndex("reminder_rent_payment_unique")');
  });

  it("serializes room allocations with a locked room row before checking capacity", () => {
    const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(source).toContain("await db.transaction(async tx =>");
    expect(source).toContain(".for(\"update\")");
    expect(source).toContain("This room has no vacant bed remaining.");
    expect(source).toContain("This tenant already has an active room allocation.");
  });

  it("uses a duplicate-safe rent reminder write under simultaneous triggers", () => {
    const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(source).toContain("onConflictDoUpdate({ target: reminders.rentPaymentId, set: reminder })");
  });

  it("requires the previously observed revision when billing records are corrected", () => {
    const router = readFileSync(new URL("./routers/pg.ts", import.meta.url), "utf8");
    const billing = readFileSync(new URL("../client/src/pages/Billing.tsx", import.meta.url), "utf8");
    const database = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    expect(router).toContain("expectedUpdatedAt: z.date()");
    expect(billing).toContain("expectedUpdatedAt: rent.updatedAt");
    expect(billing).toContain("expectedUpdatedAt: bill.updatedAt");
    expect(database).toContain("eq(rentPayments.updatedAt, input.expectedUpdatedAt)");
    expect(database).toContain("eq(electricityBills.updatedAt, input.expectedUpdatedAt)");
  });
});
