import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("concurrent device live refresh", () => {
  it("defines an active-screen-only 15-second refresh policy", () => {
    const source = readFileSync(new URL("../client/src/lib/liveQuery.ts", import.meta.url), "utf8");
    expect(source).toContain("refetchInterval: 15_000");
    expect(source).toContain("refetchIntervalInBackground: false");
    expect(source).toContain("refetchOnWindowFocus: true");
  });

  it("keeps the shared refresh policy at live query boundaries and gives selected-building screens the shared snapshot", () => {
    const liveQueryFiles = [
      "../client/src/contexts/BuildingWorkspaceContext.tsx",
      "../client/src/pages/Dashboard.tsx",
      "../client/src/pages/TenantPortal.tsx",
    ];
    for (const file of liveQueryFiles) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).toContain("liveQueryOptions");
    }
    const snapshotPages = [
      "../client/src/pages/Rooms.tsx",
      "../client/src/pages/Tenants.tsx",
      "../client/src/pages/Billing.tsx",
      "../client/src/pages/Expenses.tsx",
      "../client/src/pages/Reminders.tsx",
    ];
    for (const file of snapshotPages) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).toContain("snapshotQuery: snapshot");
    }
  });
});
