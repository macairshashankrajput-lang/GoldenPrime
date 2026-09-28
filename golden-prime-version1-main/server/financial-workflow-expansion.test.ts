import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("financial workflow expansion", () => {
  it("stores an explicit fixed monthly Owner cut and keeps the legacy percentage out of Manager input contracts", () => {
    const schema = read("drizzle-pg/schema.ts");
    const router = read("server/routers/pg.ts");
    const buildings = read("client/src/pages/Buildings.tsx");
    expect(schema).toContain('ownerMonthlyCutPaise: integer("ownerMonthlyCutPaise")');
    expect(router).toContain("ownerMonthlyCutPaise: z.number().int().min(0)");
    expect(buildings).toContain("ownerMonthlyCutPaise: toPaise");
    expect(buildings).toContain("Fixed monthly Owner cut:");
    expect(buildings).toContain("formatCurrency(building.ownerMonthlyCutPaise ?? 0)");
    expect(buildings).not.toContain("Owner share:");
  });

  it("keeps the total building electricity bill, tenant electricity collections, and Manager credit adjustments separate in reporting", () => {
    const schema = read("drizzle-pg/schema.ts");
    const db = read("server/db.ts");
    const profit = read("client/src/pages/Profit.tsx");
    const billing = read("client/src/pages/Billing.tsx");
    const dashboard = read("client/src/pages/Dashboard.tsx");
    expect(schema).toContain("governmentElectricityPayments");
    expect(schema).toContain("managerCreditAdjustments");
    expect(db).toContain("electricityCollectionPaidPaise");
    expect(db).toContain("governmentElectricityPendingPaise");
    expect(db).toContain("managerCreditAdjustmentPaise");
    expect(profit).toContain("saveGovernmentElectricity");
    expect(profit).toContain("Total building electricity bill");
    expect(billing).toContain("BuildingElectricityBillCard");
    expect(billing).toContain("One auditable record is maintained per building and month");
    expect(dashboard).toContain("Building utility bill");
    expect(dashboard).toContain("Manager result after fixed Owner cut");
    expect(dashboard).not.toContain("% Owner share");
    expect(profit).toContain("Mark paid");
  });

  it("separates unpaid tenant credit from the projected Manager result", () => {
    const db = read("server/db.ts");
    const profit = read("client/src/pages/Profit.tsx");
    expect(db).toContain("totalTenantCreditPendingPaise");
    expect(db).toContain("Tenant credit pending");
    expect(db).toContain("Projected Manager result");
    expect(profit).toContain("Only remaining tenant bill balances");
    expect(profit).toContain("fully paid bills do not create credit");
    expect(profit).toContain("summary.totalTenantCreditPendingPaise");
  });

  it("keeps Owner payment proof and tenant payment instructions inside authenticated role workspaces", () => {
    const profit = read("client/src/pages/Profit.tsx");
    const tenant = read("client/src/pages/TenantPortal.tsx");
    expect(profit).toContain('purpose: "receipt"');
    expect(profit).toContain("Attach payment proof");
    expect(tenant).toContain("Payment instructions");
    expect(tenant).toContain("paymentAccountNumber");
    expect(tenant).toContain("paymentQrUrl");
  });

  it("uses settlement-aware Owner totals while keeping Manager-controlled collections and electricity details private", () => {
    const db = read("server/db.ts");
    const owner = read("client/src/pages/OwnerOverview.tsx");
    expect(db).toContain("currentSettlement?.expectedAmountPaise");
    expect(db).toContain("nextPeriodKey");
    expect(db).toContain("monthlyBuildingExpensePaise");
    expect(owner).toContain("Owner monthly settlement");
    expect(owner).toContain("Monthly building expenses");
    expect(owner).not.toContain("Rent collected");
    expect(owner).not.toContain("Total building electric bill");
    expect(owner).not.toContain("Profit due");
    expect(owner).not.toContain("Manager credit");
  });

  it("keeps incorrect-entry deletion Manager-only, recoverable, and unavailable for paid dependent collections", () => {
    const schema = read("drizzle-pg/schema.ts");
    const db = read("server/db.ts");
    const router = read("server/routers/pg.ts");
    const billing = read("client/src/pages/Billing.tsx");
    const collections = read("client/src/pages/Collections.tsx");
    expect(schema).toContain("changeAuditLogs");
    expect(db).toContain('action: "deleted"');
    expect(db).toContain("This electricity bill has recorded collections");
    expect(router).toContain("deleteRentPayment");
    expect(router).toContain("deleteElectricityBill");
    expect(router).toContain("deleteTenantCharge");
    expect(billing).toContain("Remove incorrect record");
    expect(billing).toContain("Delete bill");
    expect(billing).toContain("Correct paid entries instead");
    expect(billing).toContain("Delete incorrect bill or collection");
    expect(collections).toContain("deletionSafety.requestDelete");
    expect(collections).toContain("Correct paid entry");
  });

  it("prevents a second automatic full-month rent cycle when the tenant already has one in the selected building and month", () => {
    const db = read("server/db.ts");
    expect(db).toContain("existingTenantMonth");
    expect(db).toContain("eq(rentPayments.tenantId, allocation.tenantId)");
    expect(db).toContain("if (existing.length === 0 && existingTenantMonth.length > 0) continue;");
  });
});
