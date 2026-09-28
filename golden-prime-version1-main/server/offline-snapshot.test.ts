import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { clearOfflineWorkspaceSnapshots, getOfflineSnapshotFreshness, loadLastOfflineWorkspaceSnapshot, loadOfflineWorkspaceSnapshot, saveOfflineWorkspaceSnapshot } from "../client/src/lib/offlineSnapshot";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const localStorage = new MemoryStorage();

Object.defineProperty(globalThis, "window", {
  value: { localStorage },
  configurable: true,
});

describe("offline workspace snapshots", () => {
  beforeEach(() => localStorage.clear());

  it("stores and loads the latest successful workspace only for the same user and building", () => {
    saveOfflineWorkspaceSnapshot({ userId: 11, buildingId: 51, building: { id: 51, name: "Golden Prime" }, data: { rooms: [{ id: 1 }] } });

    expect(loadOfflineWorkspaceSnapshot(11, 51)).toMatchObject({ userId: 11, building: { name: "Golden Prime" }, data: { rooms: [{ id: 1 }] } });
    expect(loadLastOfflineWorkspaceSnapshot(11)?.userId).toBe(11);
    expect(loadLastOfflineWorkspaceSnapshot(12)).toBeNull();
    expect(loadOfflineWorkspaceSnapshot(11, 52)).toBeNull();
  });

  it("removes all locally stored workspace records for the signing-out user without affecting another user", () => {
    saveOfflineWorkspaceSnapshot({ userId: 11, buildingId: 51, building: { id: 51 }, data: { rooms: [] } });
    saveOfflineWorkspaceSnapshot({ userId: 12, buildingId: 61, building: { id: 61 }, data: { rooms: [] } });

    clearOfflineWorkspaceSnapshots(11);

    expect(loadOfflineWorkspaceSnapshot(11, 51)).toBeNull();
    expect(loadOfflineWorkspaceSnapshot(12, 61)).not.toBeNull();
  });

  it("labels snapshot age accurately and escalates data that is at least one day old", () => {
    const now = Date.parse("2026-08-23T12:00:00.000Z");
    expect(getOfflineSnapshotFreshness("2026-08-23T11:58:00.000Z", now)).toMatchObject({ ageLabel: "2 minutes ago", isStale: false });
    expect(getOfflineSnapshotFreshness("2026-08-23T10:00:00.000Z", now)).toMatchObject({ ageLabel: "2 hours ago", isStale: false });
    expect(getOfflineSnapshotFreshness("2026-08-22T12:00:00.000Z", now)).toMatchObject({ ageLabel: "1 day ago", isStale: true });
    expect(getOfflineSnapshotFreshness("not-a-date", now)).toMatchObject({ ageLabel: "unknown age", isStale: true });
  });

  it("keeps the snapshot route separate from authenticated mutation-capable routes", () => {
    const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    const snapshotPage = readFileSync(new URL("../client/src/pages/OfflineSnapshot.tsx", import.meta.url), "utf8");
    const tenantPortal = readFileSync(new URL("../client/src/pages/TenantPortal.tsx", import.meta.url), "utf8");
    expect(appSource).toContain('path="/offline"');
    expect(appSource).toContain('if (!isOnline) return <Redirect to="/offline" />');
    expect(snapshotPage).toContain("Offline read-only snapshot");
    expect(snapshotPage).toContain("cannot create, edit, or record payments while offline");
    expect(snapshotPage).toContain("TenantOfflineSnapshot");
    expect(snapshotPage).toContain("Snapshot age:");
    expect(snapshotPage).toContain("more than 24 hours old");
    expect(snapshotPage).toContain('window.location.replace("/")');
    expect(tenantPortal).toContain('data: { kind: "tenant", portal: portal.data');
  });
});
