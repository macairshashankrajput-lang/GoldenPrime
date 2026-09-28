import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("payment method and proof contracts", () => {
  it("persists a nullable payment method for every payable record type", () => {
    const db = source("server/db.ts");
    expect(db).toContain('paymentMethod: "cash" | "upi" | "bank_transfer" | null');
    expect(db).toContain('await db.update(rentPayments).set({ receiptUrl: input.receiptUrl, paymentMethod: input.paymentMethod, receiptReviewStatus: "pending"');
    expect(db).toContain('await db.update(tenantCharges).set({ receiptUrl: input.receiptUrl, paymentMethod: input.paymentMethod, receiptReviewStatus: "pending"');
    expect(db).toContain('await db.update(electricityBills).set({ receiptUrl: input.receiptUrl, paymentMethod: input.paymentMethod, receiptReviewStatus: "pending"');
  });

  it("keeps a tenant receipt submission as proof only, not a cash settlement", () => {
    const db = source("server/db.ts");
    const receiptProcedure = db.slice(db.indexOf("export async function submitTenantPaymentReceipt"), db.indexOf("export async function updateUserRole"));
    expect(receiptProcedure).toContain("paymentMethod: input.paymentMethod");
    expect(receiptProcedure).not.toContain("paidAmountPaise");
    expect(receiptProcedure).not.toContain("status: \"paid\"");
  });

  it("reuses the unique rent reminder when a tenant submits proof for an existing rent cycle", () => {
    const db = source("server/db.ts");
    const rentReceiptBranch = db.slice(db.indexOf('if (input.type === "rent")'), db.indexOf('if (input.type === "tenant_charge")'));
    expect(rentReceiptBranch).toContain("await syncRentPaymentReminder");
    expect(rentReceiptBranch).toContain("dueDate: payment.dueDate");
    expect(rentReceiptBranch).not.toContain("Tenant payment receipt submitted · Rent");
  });

  it("shows mobile-ready method selectors and image-upload controls on both portals", () => {
    const billing = source("client/src/pages/Billing.tsx");
    const tenant = source("client/src/pages/TenantPortal.tsx");
    expect(billing).toContain("function PaymentMethodField");
    expect(billing).toContain('imageUploadFields("receipt", editingTenantCharge.receiptUrl)');
    expect(tenant).toContain("Payment method for your receipt");
    expect(tenant).toContain("paymentMethod: tenantPaymentMethod");
  });

  it("shows current tenant-wise and room-wise billing states, including due and credit conditions", () => {
    const billing = source("client/src/pages/Billing.tsx");
    expect(billing).toContain("Tenant-wise collection status");
    expect(billing).toContain("Room-wise billing status");
    expect(billing).toContain('label: "Credit"');
    expect(billing).toContain('label: "Due"');
    expect(billing).toContain("getCollectionStatus");
    expect(billing).toContain("recordEditorRef.current?.scrollIntoView");
  });

  it("provides direct meter reading entry that creates a current-room electricity bill and refreshes statuses", () => {
    const billing = source("client/src/pages/Billing.tsx");
    expect(billing).toContain("Meter reading entry");
    expect(billing).toContain("Calculate bill & refresh status");
    expect(billing).toContain("const unbilledMeterRooms");
    expect(billing).toContain("await electricityMutation.mutateAsync");
    expect(billing).toContain("billingMonth: billingMonth");
    expect(billing).toContain("await refresh(); setShowForm(false); uploadFeedback.clear(); toast.success(`Electricity bill calculated:");
    expect(billing).toContain("Meter photo (optional)");
    expect(billing).toContain("onUploadMeterPhoto");
    expect(billing).toContain('purpose: "meter"');
    expect(billing).toContain("meterImageUrl: input.meterImageUrl");
  });

  it("exposes a historical billing workspace with shared category and conflict recovery controls", () => {
    const billing = source("client/src/pages/Billing.tsx");
    const collections = source("client/src/pages/Collections.tsx");
    const expenses = source("client/src/pages/Expenses.tsx");
    expect(billing).toContain('type="month" value={billingMonth}');
    expect(billing).toContain("Other expenses");
    expect(billing).toContain("Collection status");
    expect(billing).toContain("latest record was loaded from another device");
    expect(collections).toContain("requestedMonth");
    expect(collections).toContain('type="month"');
    expect(expenses).toContain("defaultExpenseDate");
  });

  it("marks Tenant proof as pending and provides an optimistic Manager-only review decision", () => {
    const db = source("server/db.ts");
    const router = source("server/routers/pg.ts");
    const billing = source("client/src/pages/Billing.tsx");
    expect(db).toContain('receiptReviewStatus: "pending"');
    expect(db).toContain("export async function reviewTenantPaymentReceipt");
    expect(router).toContain("receiptReviews: router");
    expect(router).toContain("Only the Owner or Manager can review tenant payment proof.");
    expect(router).toContain("A rejection note is required before rejecting tenant payment proof.");
    expect(db).toContain("export async function getReceiptReviewHistory");
    expect(billing).toContain("Tenant receipt review");
    expect(billing).toContain("Receipt review audit history");
    expect(billing).toContain("All tenants");
    expect(billing).toContain("Reviewed from");
    expect(billing).toContain("ReceiptReviewPeriodPresets");
    expect(source("client/src/components/ReceiptReviewPeriodPresets.tsx")).toContain("Last 7 days");
    expect(billing).toContain("Payment method");
    expect(billing).toContain("Min amount (₹)");
    expect(billing).toContain("All reviewers");
    expect(router).toContain("Minimum amount must not exceed maximum amount.");
    expect(billing).toContain("does not change the payment amount or settlement status");
  });
});
