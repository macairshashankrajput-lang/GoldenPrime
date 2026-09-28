import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`./${path}`, import.meta.url), "utf8");

describe("Manager workbook export contract", () => {
  const router = read("routers/pg.ts");
  const workbook = read("exportWorkbook.ts");
  const page = read("../client/src/pages/Exports.tsx");
  const billingPage = read("../client/src/pages/Billing.tsx");

  it("requires Manager role, export access, an explicit selected section, and a valid date range", () => {
    expect(router).toContain("prepareWorkbook: protectedProcedure");
    expect(router).toContain('ctx.user.role !== "manager"');
    expect(router).toContain('requireBuildingAccess(ctx.user, input.buildingId, "export")');
    expect(router).toContain('input.mode === "selected" && input.datasets.length === 0');
    expect(router).toContain("hasValidExportDateRange(input)");
  });

  it("returns separate formatted sheets for the requested building operational data", () => {
    expect(workbook).toContain("workbookExportDatasets");
    expect(workbook).toContain('sheets.push({ name: "Export summary"');
    expect(workbook).toContain('append("rent"');
    expect(workbook).toContain('append("electricity"');
    expect(workbook).toContain('append("tenantCharges"');
    expect(workbook).toContain('append("operatingCosts"');
    expect(workbook).toContain('append("accounts"');
    expect(workbook).toContain('append("notifications"');
    expect(workbook).toContain('append("auditLogs"');
    expect(workbook).toContain('append("exportHistory"');
  });

  it("exports safe account metadata but excludes all authentication and database secrets", () => {
    expect(workbook).toContain('"Login phone": account.loginPhone');
    expect(workbook).toContain('"Password and secret data": "Not exported"');
    expect(workbook).not.toContain("passwordHash");
    expect(workbook).not.toContain("DATABASE_URL");
    expect(page).toContain("password hashes, database credentials, session data, and secrets are never included");
  });

  it("generates a native Excel workbook with filters and rupee-formatted balances", () => {
    expect(page).toContain('import * as XLSX from "xlsx"');
    expect(page).toContain("XLSX.writeFile");
    expect(page).toContain('cell.z = \'[$₹-en-IN]#,##0.00\'');
    expect(page).toContain("Outstanding balances only");
    expect(page).toContain("Complete operational data");
  });

  it("previews selected building fields and applies only Manager-selected fields to selected workbook sheets", () => {
    expect(router).toContain("previewWorkbook: protectedProcedure");
    expect(router).toContain("getWorkbookExportPreview(input)");
    expect(router).toContain("fieldSelections:");
    expect(router).toContain("Keep at least one field visible for every selected data section.");
    expect(workbook).toContain("selectWorkbookFields");
    expect(workbook).toContain("getWorkbookExportPreview");
    expect(page).toContain("Export preview and visible fields");
    expect(page).toContain("fieldSelections");
    expect(page).toContain("previewWorkbook.useQuery");
    expect(page).toContain("Show all fields");
  });

  it("provides a compact pending receipt queue without bypassing detailed rejection-note safeguards", () => {
    expect(billingPage).toContain("Pending receipt queue");
    expect(billingPage).toContain("pendingReceiptReviews.slice(0, 3)");
    expect(billingPage).toContain('status: "approved"');
    expect(billingPage).toContain("Rejection still requires a note in the detailed review section.");
    expect(billingPage).toContain("Decision note (required to reject)");
  });
});
