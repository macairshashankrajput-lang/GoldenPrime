import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatRentMonth, getMonthEnd, getRentDueDate } from "./db";

describe("automatic monthly rent-cycle date helpers", () => {
  it("formats UTC months and calculates inclusive month ends", () => {
    expect(formatRentMonth(new Date("2026-02-01T00:00:00.000Z"))).toBe("2026-02");
    expect(getMonthEnd("2026-02")).toBe("2026-02-28");
    expect(getMonthEnd("2028-02")).toBe("2028-02-29");
  });

  it("clamps configurable rent due days to the actual month length", () => {
    expect(getRentDueDate("2026-02", 28)).toBe("2026-02-28");
    expect(getRentDueDate("2028-02", 31)).toBe("2028-02-29");
    expect(getRentDueDate("2026-04", 31)).toBe("2026-04-30");
    expect(getRentDueDate("2026-08", 0)).toBe("2026-08-01");
  });
});

describe("automatic collection persistence safety", () => {
  const dbSource = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");
  const schemaSource = readFileSync(resolve(process.cwd(), "drizzle-pg/schema.ts"), "utf8");

  it("skips rent cycles before a tenant moves in and preserves existing payment values on retry", () => {
    expect(dbSource).toContain("allocation.moveInDate.slice(0, 7) > input.rentMonth");
    expect(dbSource).toContain("onConflictDoUpdate({ target: [rentPayments.allocationId, rentPayments.rentMonth], set: { rentMonth: input.rentMonth } })");
  });

  it("deduplicates rent-cycle and due notifications through stable payment reference keys", () => {
    expect(dbSource).toContain("rent-cycle-${payment.id}");
    expect(dbSource).toContain("rent-upcoming-${rent.id}");
    expect(dbSource).toContain("rent-overdue-${rent.id}");
    expect(dbSource).toContain("electricity-upcoming-${bill.id}");
    expect(dbSource).toContain("electricity-overdue-${bill.id}");
  });

  it("requires an explicit Manager delivery request before an overdue rent record becomes eligible for scheduled delivery", () => {
    expect(dbSource).toContain("isNotNull(reminders.deliveryRequestedAt)");
    expect(dbSource).toContain("innerJoin(reminders");
    expect(dbSource).toContain("deliveryRequestedBy: input.createdBy");
  });

  it("keeps each allocation’s agreed rent and derives only the room display total from active allocation rents", () => {
    expect(dbSource).toContain("calculateRoomRentTotal(allocations.map(allocation => allocation.monthlyRentPaise))");
    expect(dbSource).toContain("monthlyRentPaise: input.monthlyRentPaise");
    expect(dbSource).not.toContain("syncRoomRentShares");
  });

  it("continues to split room electricity and room-shared expense liabilities equally by active recipients", () => {
    expect(dbSource).toContain("liabilityMode: \"room_shared\"");
    expect(dbSource).toContain("splitPaiseEvenly(input.amountPaise, recipientIds.length)");
  });

  it("materializes active tenant services as their own monthly tenant bills without sharing them across room occupants", () => {
    expect(dbSource).toContain("ensureMonthlyTenantServiceCharges(input)");
    expect(dbSource).toContain('sourceType: "tenant_service"');
    expect(dbSource).toContain('liabilityMode: "tenant_assigned"');
    expect(dbSource).toContain("eq(tenantServices.active, \"active\")");
    expect(dbSource).toContain("input.billingMonth ? eq(tenantCharges.billingMonth, input.billingMonth) : isNull(tenantCharges.billingMonth)");
    expect(schemaSource).toContain("tenant_charge_source_tenant_month_unique");
  });

  it("does not count an individual tenant service both as configured service income and as a tenant charge recovery", () => {
    expect(dbSource).toContain("monthlyServiceChargeExpectedPaise: monthlyServiceChargePaise, collectedTenantChargeRecoveryPaise");
    expect(dbSource).toContain("monthlyServiceChargeExpectedPaise: monthlyServiceChargePaise, expectedTenantChargeRecoveryPaise");
  });

  it("keeps tenant and room status cards scoped to the current billing month and protects edit actions with their matching view mode", () => {
    const billingSource = readFileSync(resolve(process.cwd(), "client/src/pages/Billing.tsx"), "utf8");
    expect(billingSource).toContain("charge.billingMonth === billingMonth");
    expect(billingSource).toContain('setMode("rent"); setEditingBillId(null); setEditingTenantChargeId(null); setEditingRentId(rent.id);');
    expect(billingSource).toContain('setMode("electricity"); setEditingRentId(null); setEditingTenantChargeId(null); setEditingBillId(bill.id);');
  });
});
