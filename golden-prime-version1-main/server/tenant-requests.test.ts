import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle-pg/schema";

const mocked = vi.hoisted(() => ({
  createTenantSupportRequest: vi.fn(),
  getTenantPortal: vi.fn(),
  submitTenantPaymentReceipt: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, ...mocked };
});

import { tenantRouter } from "./routers/tenant";

const tenant = { id: 8, role: "tenant", name: "Shashank" } as User;
const owner = { id: 9, role: "admin", name: "Kapil" } as User;
const context = (user: User) => ({ user, req: {} as never, res: {} as never });

describe("tenant support request operation", () => {
  it("returns the active-room electricity record to the authenticated tenant portal", async () => {
    const portal = { tenant: { id: 1, fullName: "Shashank" }, allocation: { roomId: 60001, status: "active" }, room: { id: 60001, number: "302" }, building: { id: 1, name: "Golden Prime PG" }, rents: [], electricity: [{ id: 9, roomId: 60001, billingMonth: "2026-08", unitsConsumed: 200, ratePerUnitPaise: 1200, billAmountPaise: 240000 }], reminders: [] };
    mocked.getTenantPortal.mockResolvedValueOnce(portal);
    const caller = tenantRouter.createCaller(context(tenant));
    await expect(caller.me()).resolves.toEqual(portal);
  });

  it("uses the configured sharing type rather than an individual-stay fallback on the tenant room card", () => {
    const portalSource = readFileSync(new URL("../client/src/pages/TenantPortal.tsx", import.meta.url), "utf8");
    expect(portalSource).toContain('double: "Double sharing"');
    expect(portalSource).toContain('allocation?.bedLabel ? `Bed ${allocation.bedLabel}` : roomStayLabel');
  });

  it("shows a tenant-visible link to the verified meter photo stored with an electricity bill", () => {
    const portalSource = readFileSync(new URL("../client/src/pages/TenantPortal.tsx", import.meta.url), "utf8");
    expect(portalSource).toContain("bill.meterImageUrl");
    expect(portalSource).toContain("View meter photo");
    expect(portalSource).toContain('href={bill.meterImageUrl}');
  });

  it("shows only the tenant's allocated electricity share and all allocated service or expense bills", () => {
    const portalSource = readFileSync(new URL("../client/src/pages/TenantPortal.tsx", import.meta.url), "utf8");
    expect(portalSource).toContain("latestElectricityShare");
    expect(portalSource).toContain("Your latest electricity share");
    expect(portalSource).toContain("Your allocated bills");
    expect(portalSource).toContain('charge.sourceType === "tenant_service" ? "service"');
  });

  it("creates a Manager-visible request for the authenticated tenant", async () => {
    const caller = tenantRouter.createCaller(context(tenant));
    await expect(caller.requests.create({ category: "maintenance", description: "The room fan needs repair." })).resolves.toEqual({ success: true });
    expect(mocked.createTenantSupportRequest).toHaveBeenCalledWith({ userId: 8, category: "maintenance", description: "The room fan needs repair." });
  });

  it("rejects non-tenant request creation", async () => {
    const caller = tenantRouter.createCaller(context(owner));
    await expect(caller.requests.create({ category: "other", description: "This call is not permitted." })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a tenant to submit only a referenced payment receipt", async () => {
    mocked.submitTenantPaymentReceipt.mockResolvedValueOnce({ success: true, label: "Rent 2026-08" });
    const caller = tenantRouter.createCaller(context(tenant));
    await expect(caller.payments.submitReceipt({ type: "rent", billId: 19, paymentMethod: "upi", receiptUrl: "https://example.com/receipt.jpg" })).resolves.toEqual({ success: true, label: "Rent 2026-08" });
    expect(mocked.submitTenantPaymentReceipt).toHaveBeenCalledWith({ userId: 8, type: "rent", billId: 19, paymentMethod: "upi", receiptUrl: "https://example.com/receipt.jpg" });
  });

  it("rejects non-tenant payment receipt submission", async () => {
    const caller = tenantRouter.createCaller(context(owner));
    await expect(caller.payments.submitReceipt({ type: "electricity", billId: 19, paymentMethod: "cash", receiptUrl: "https://example.com/receipt.jpg" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
