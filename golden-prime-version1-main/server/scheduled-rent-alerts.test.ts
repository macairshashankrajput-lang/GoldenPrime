import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { readFileSync } from "node:fs";

const mocked = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  ensureMonthlyRentCycles: vi.fn(),
  refreshManagerCollectionNotifications: vi.fn(),
  getUnnotifiedOverdueRentPayments: vi.fn(),
  markRentPaymentsOverdueNotified: vi.fn(),
  notifyOwner: vi.fn(),
}));

vi.mock("./db", () => ({
  ensureMonthlyRentCycles: mocked.ensureMonthlyRentCycles,
  formatRentMonth: () => "2026-08",
  getUnnotifiedOverdueRentPayments: mocked.getUnnotifiedOverdueRentPayments,
  markRentPaymentsOverdueNotified: mocked.markRentPaymentsOverdueNotified,
  refreshManagerCollectionNotifications: mocked.refreshManagerCollectionNotifications,
}));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: mocked.authenticateRequest } }));
vi.mock("./_core/notification", () => ({ notifyOwner: mocked.notifyOwner }));

import { sendOverdueRentAlerts } from "./scheduled/rentAlerts";

function responseMock() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as unknown as Response & { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
}

describe("daily collection Heartbeat", () => {
  it("rejects non-cron callers before any collection work runs", async () => {
    mocked.authenticateRequest.mockResolvedValue({ isCron: false });
    const response = responseMock();
    await sendOverdueRentAlerts({ originalUrl: "/api/scheduled/rent-overdue-alerts" } as Request, response);
    expect(response.status).toHaveBeenCalledWith(403);
    expect(mocked.ensureMonthlyRentCycles).not.toHaveBeenCalled();
  });

  it("idempotently generates this month’s cycles and refreshes Manager alerts before returning a no-overdue result", async () => {
    mocked.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "cron-collection" });
    mocked.ensureMonthlyRentCycles.mockResolvedValue({ created: 0, rentMonth: "2026-08" });
    mocked.refreshManagerCollectionNotifications.mockResolvedValue({ refreshed: 3, cutoffDate: "2026-08-25" });
    mocked.getUnnotifiedOverdueRentPayments.mockResolvedValue([]);
    const response = responseMock();
    await sendOverdueRentAlerts({ originalUrl: "/api/scheduled/rent-overdue-alerts" } as Request, response);
    expect(mocked.ensureMonthlyRentCycles).toHaveBeenCalledWith({ rentMonth: "2026-08" });
    expect(mocked.refreshManagerCollectionNotifications).toHaveBeenCalledWith(expect.objectContaining({ today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true, notified: 0, cycles: { created: 0, rentMonth: "2026-08" }, notifications: { refreshed: 3, cutoffDate: "2026-08-25" } }));
  });

  it("delivers only the explicitly eligible reminder set returned by the guarded overdue query", async () => {
    mocked.authenticateRequest.mockResolvedValue({ isCron: true, taskUid: "cron-collection" });
    mocked.ensureMonthlyRentCycles.mockResolvedValue({ created: 0, rentMonth: "2026-08" });
    mocked.refreshManagerCollectionNotifications.mockResolvedValue({ refreshed: 0, cutoffDate: "2026-08-25" });
    mocked.getUnnotifiedOverdueRentPayments.mockResolvedValue([{ id: 31, expectedAmountPaise: 80000, paidAmountPaise: 10000 }]);
    mocked.notifyOwner.mockResolvedValue(true);
    const response = responseMock();
    await sendOverdueRentAlerts({ originalUrl: "/api/scheduled/rent-overdue-alerts" } as Request, response);
    expect(mocked.notifyOwner).toHaveBeenCalledTimes(1);
    expect(mocked.markRentPaymentsOverdueNotified).toHaveBeenCalledWith([31]);
  });

  it("does not let recording an overdue due date send an immediate owner notification", () => {
    const routerSource = readFileSync(new URL("./routers/pg.ts", import.meta.url), "utf8");
    expect(routerSource).not.toContain('title: "Overdue PG rent"');
    expect(routerSource).toContain("ownerAlertSent: false");
  });
});
