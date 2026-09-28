import { beforeAll, describe, expect, it } from "vitest";

import {
  getBuildingSnapshot,
  getDashboardOverview,
  getOwnerOverview,
  getTenantPortal,
  getUsers,
  listBuildingsForUser,
} from "./db";

const hasDatabase = Boolean(process.env.SUPABASE_DATABASE_URL
  ?? process.env.POSTGRES_URL
  ?? process.env.POSTGRES_PRISMA_URL
  ?? process.env.POSTGRES_URL_NON_POOLING);

describe.skipIf(!hasDatabase)("Supabase PostgreSQL read-only runtime", () => {
  let buildingId = 0;
  let tenantUserId = 0;

  beforeAll(async () => {
    const accounts = await getUsers();
    const manager = accounts.find(account => account.role === "manager");
    expect(manager).toBeDefined();

    const buildings = await listBuildingsForUser(manager!);
    if (buildings.length === 0) return;
    buildingId = buildings[0]!.id;

    const snapshot = await getBuildingSnapshot(buildingId);
    const tenant = snapshot.tenants.find(record => record.userId !== null);
    if (tenant?.userId) tenantUserId = tenant.userId;
  }, 15_000);

  it("returns only data scoped to the Manager-selected building", async () => {
    if (!buildingId) {
      expect(buildingId).toBe(0);
      return;
    }
    const snapshot = await getBuildingSnapshot(buildingId);
    expect(snapshot.rooms.every(record => record.buildingId === buildingId)).toBe(true);
    expect(snapshot.tenants.every(record => record.buildingId === buildingId)).toBe(true);
    expect(snapshot.allocations.every(record => record.buildingId === buildingId)).toBe(true);
  });

  it("preserves tenant-scoped portal data and current financial summaries", async () => {
    if (!buildingId || !tenantUserId) {
      expect(await getTenantPortal(tenantUserId)).toBeUndefined();
      return;
    }
    const portal = await getTenantPortal(tenantUserId);
    expect(portal?.tenant.userId).toBe(tenantUserId);
    expect(portal?.building.id).toBe(buildingId);
    expect(portal?.rents.every(record => record.tenantId === portal?.tenant.id)).toBe(true);

    const dashboard = await getDashboardOverview(buildingId, 1, "monthly");
    expect(dashboard.summary.totalRooms).toBeGreaterThanOrEqual(0);
    expect(dashboard.summary.activeTenants).toBeGreaterThanOrEqual(0);
  });

  it("keeps the Owner summary scoped to linked buildings only", async () => {
    const ownerSummary = await getOwnerOverview({ buildingIds: buildingId ? [buildingId] : [], periodMode: "monthly" });
    expect(ownerSummary.buildings).toHaveLength(buildingId ? 1 : 0);
    if (buildingId) expect(ownerSummary.buildings[0]?.building.id).toBe(buildingId);
  });
});
