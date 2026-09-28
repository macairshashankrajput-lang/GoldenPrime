import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("period-aware dashboard reporting contracts", () => {
  const dbSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const dashboardSource = readFileSync(new URL("../client/src/pages/Dashboard.tsx", import.meta.url), "utf8");
  const billingSource = readFileSync(new URL("../client/src/pages/Billing.tsx", import.meta.url), "utf8");

  it("aggregates records by month prefix so a yearly view includes every month", () => {
    expect(dbSource).toContain("const matchesPeriod = (value: string) => value.startsWith(month)");
    expect(dbSource).toContain("snapshot.rents.filter(rent => matchesPeriod(rent.rentMonth))");
    expect(dbSource).toContain("snapshot.electricity.filter(bill => matchesPeriod(bill.billingMonth))");
    expect(dbSource).toContain("snapshot.expenses.filter(expense => matchesPeriod(expense.expenseDate))");
  });

  it("returns and renders requested collection, credit, expense, occupancy, and insight data", () => {
    expect(dbSource).toContain("totalTenantCreditPendingPaise");
    expect(dbSource).toContain("periodTenantChargeExpectedPaise");
    expect(dbSource).toContain("periodTenantChargePendingPaise");
    expect(dbSource).toContain("totalExpensesBookedPaise");
    expect(dbSource).toContain("filledRooms");
    expect(dbSource).toContain("const insights:");
    expect(dbSource).toContain('id: "tenant-charge-pending"');
    expect(dashboardSource).toContain('setPeriodMode("yearly")');
    expect(dashboardSource).toContain("Tenant credit pending");
    expect(dashboardSource).toContain("insights.map(insight");
  });

  it("defines tenant credit as only the remaining rent, electricity, and assigned-cost balances", () => {
    expect(dbSource).toContain("const totalTenantCreditPendingPaise = pendingPaise + electricityCollectionPendingPaise + periodTenantChargePendingPaise;");
    expect(dbSource).toContain("rent.expectedAmountPaise > rent.paidAmountPaise");
    expect(dbSource).toContain("charge.expectedAmountPaise > charge.paidAmountPaise");
    expect(dbSource).toContain("Fully settled bills do not create credit entries.");
    expect(dbSource).not.toContain("totalCreditCollectedPaise");
    expect(dashboardSource).toContain("Only remaining tenant bill balances");
    expect(dashboardSource).toContain("summary.totalTenantCreditPendingPaise");
  });

  it("aggregates each tenant's outstanding credit and renders it as a red Manager dashboard watch row", () => {
    expect(dbSource).toContain("const tenantCreditById = new Map");
    expect(dbSource).toContain("monthlyRents.forEach(rent => addTenantCredit");
    expect(dbSource).toContain("electricityTenantCharges.forEach(charge => addTenantCredit");
    expect(dbSource).toContain("periodTenantCharges.forEach(charge => addTenantCredit");
    expect(dbSource).toContain("const tenantCreditRows = Array.from(tenantCreditById.values())");
    expect(dbSource).toContain("tenantCreditRows,");
    expect(dashboardSource).toContain("Tenant credit watch");
    expect(dashboardSource).toContain("Credit balance pending");
    expect(dashboardSource).toContain("border-rose-200 bg-rose-50/70");
    expect(dashboardSource).toContain('selectedMetric === "credit"');
  });

  it("adds overdue timing, WhatsApp reminders, and a safe payment-editor shortcut for each credit-watch tenant", () => {
    expect(dbSource).toContain("earliestDueDate");
    expect(dbSource).toContain("overdueDays:");
    expect(dbSource).toContain("Date.parse(`${today}T00:00:00.000Z`)");
    expect(dbSource).toContain("paymentTarget");
    expect(dashboardSource).toContain("buildWhatsAppShareUrl");
    expect(dashboardSource).toContain("buildReminderShareMessage");
    expect(dashboardSource).toContain("WhatsApp reminder");
    expect(dashboardSource).toContain('day{row.overdueDays === 1 ? "" : "s"} overdue');
    expect(dashboardSource).toContain("Mark payment received");
    expect(dashboardSource).toContain("paymentType=${row.paymentTarget.type}&recordId=${row.paymentTarget.recordId}");
  });

  it("accepts and renders validated historical month and year picker values", () => {
    expect(dbSource).toContain("getDashboardPeriod(periodMode, new Date(), periodKey)");
    expect(dashboardSource).toContain("const [selectedMonth, setSelectedMonth]");
    expect(dashboardSource).toContain("const [selectedYear, setSelectedYear]");
    expect(dashboardSource).toContain('type="month"');
    expect(dashboardSource).toContain("periodKey },");
  });

  it("provides scoped record lists and clickable dashboard metric drill-downs", () => {
    expect(dbSource).toContain("const metricDetails: Record<string");
    expect(dbSource).toContain("rentExpected:");
    expect(dbSource).toContain("electricityPending:");
    expect(dbSource).toContain("projectedProfit:");
    expect(dbSource).toContain("metricDetails,");
    expect(dashboardSource).toContain("setSelectedMetric(metric.detailKey)");
    expect(dashboardSource).toContain("<Dialog open={Boolean(selectedMetricDetail)}");
    expect(dashboardSource).toContain("selectedMetricDetail?.items.map(item");
  });

  it("opens the exact pending rent or electricity record from a drill-down payment action", () => {
    expect(dbSource).toContain('paymentTarget: { type: "rent" as const, recordId: rent.id }');
    expect(dbSource).toContain('paymentTarget: { type: "electricity" as const, recordId: bill.id }');
    expect(dashboardSource).toContain("Record payment");
    expect(dashboardSource).toContain("paymentType=${paymentTarget.type}&recordId=${paymentTarget.recordId}");
    expect(billingSource).toContain('paymentType === "rent"');
    expect(billingSource).toContain('paymentType === "electricity"');
  });

  it("offers half, full, and custom amount controls for every settlement path", () => {
    expect(dbSource).toContain('type: "tenantCharge" as const');
    expect(billingSource).toContain("function PaymentPresets");
    expect(billingSource).toContain("Add half remaining");
    expect(billingSource).toContain("Settle full balance");
    expect(billingSource).toContain("Custom amount");
    expect(billingSource).toContain('inputId="rent-payment-amount"');
    expect(billingSource).toContain('inputId="electricity-payment-amount"');
    expect(billingSource).toContain('inputId="tenant-charge-payment-amount"');
  });
});
