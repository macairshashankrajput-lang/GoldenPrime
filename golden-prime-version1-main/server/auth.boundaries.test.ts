import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRentPaymentReminder } from "./db";

describe("authentication and reminder boundaries", () => {
  it("builds a tenant-linked reminder for each unpaid rent record", () => {
    expect(buildRentPaymentReminder({
      id: 42,
      buildingId: 7,
      tenantId: 11,
      rentMonth: "2026-08",
      dueDate: "2026-08-05",
      createdBy: 3,
    })).toEqual({
      buildingId: 7,
      tenantId: 11,
      rentPaymentId: 42,
      title: "Rent due · 2026-08",
      dueDate: "2026-08-05",
      status: "active",
      notifiedAt: null,
      createdBy: 3,
    });
  });

  it("does not expose a legacy OAuth callback or OAuth login control", () => {
    const serverBootstrap = readFileSync(new URL("./_core/index.ts", import.meta.url), "utf8");
    const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    expect(serverBootstrap).not.toContain("/api/oauth");
    expect(appSource).not.toMatch(/oauth/i);
  });
});

export {};
