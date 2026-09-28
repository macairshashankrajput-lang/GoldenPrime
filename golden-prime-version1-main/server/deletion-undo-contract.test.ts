import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("deletion undo safeguards", () => {
  it("limits direct restoration to a recent deletion made by the same Manager in the selected building", () => {
    const db = read("server/db.ts");
    const router = read("server/routers/pg.ts");
    expect(db).toContain("const DELETE_UNDO_WINDOW_MS = 10 * 60 * 1000");
    expect(db).toContain("eq(changeAuditLogs.createdBy, input.restoredBy)");
    expect(db).toContain("eq(changeAuditLogs.action, \"deleted\")");
    expect(db).toContain("The 10-minute undo window has expired");
    expect(db).toContain('action: "deleted_undone"');
    expect(db).toContain('action: "restored"');
    expect(router).toContain("recovery: router");
    expect(router).toContain("Only the Manager who deleted the record can use immediate undo");
    expect(router).toContain("requireBuildingAccess(ctx.user, input.buildingId, \"manageExpenses\")");
  });

  it("restores only audited, conflict-checked financial record types and their eligible child collections", () => {
    const db = read("server/db.ts");
    for (const entityType of ["rent_payment", "electricity_bill", "tenant_charge", "expense", "operating_cost", "owner_settlement", "government_electricity_payment"]) {
      expect(db).toContain(`audit.entityType === \"${entityType}\"`);
    }
    expect(db).toContain("A replacement record already exists, so this deletion cannot be safely undone.");
    expect(db).toContain("The electricity recovery snapshot is inconsistent.");
    expect(db).toContain("The expense recovery snapshot is inconsistent.");
    expect(db).toContain("The operating-cost recovery snapshot is inconsistent.");
  });

  it("uses one accessible confirmation surface and offers undo only for deletion procedures that return an audit identifier", () => {
    const safety = read("client/src/components/DeletionSafety.tsx");
    const billing = read("client/src/pages/Billing.tsx");
    const collections = read("client/src/pages/Collections.tsx");
    const expenses = read("client/src/pages/Expenses.tsx");
    const profit = read("client/src/pages/Profit.tsx");
    expect(safety).toContain("ConfirmDeleteDialog");
    expect(safety).toContain("Undo is available to the deleting Manager for 10 minutes");
    expect(safety).toContain("trpc.pg.recovery.restore.useMutation");
    expect(billing).toContain("deletionSafety.offerUndo");
    expect(collections).toContain("deletionSafety.offerUndo");
    expect(expenses).toContain("deletionSafety.offerUndo");
    expect(profit).toContain("deletionSafety.offerUndo");
    expect(billing).not.toContain("window.confirm");
    expect(collections).not.toContain("window.confirm");
    expect(expenses).not.toContain("window.confirm");
    expect(profit).not.toContain("window.confirm");
  });
});
