const SNAPSHOT_PREFIX = "golden-prime-offline-workspace";
const LAST_SNAPSHOT_KEY = "golden-prime-offline-workspace-last";

export type OfflineWorkspaceSnapshot = {
  version: 1;
  userId: number;
  building: Record<string, unknown>;
  data: Record<string, unknown>;
  capturedAt: string;
};

export function getOfflineSnapshotFreshness(capturedAt: string, now = Date.now()) {
  const capturedAtMs = Date.parse(capturedAt);
  if (!Number.isFinite(capturedAtMs)) return { ageMs: null, ageLabel: "unknown age", isStale: true };
  const ageMs = Math.max(0, now - capturedAtMs);
  const minutes = Math.floor(ageMs / 60_000);
  const hours = Math.floor(ageMs / 3_600_000);
  const days = Math.floor(ageMs / 86_400_000);
  const ageLabel = minutes < 1 ? "just now" : minutes < 60 ? `${minutes} minute${minutes === 1 ? "" : "s"} ago` : hours < 24 ? `${hours} hour${hours === 1 ? "" : "s"} ago` : `${days} day${days === 1 ? "" : "s"} ago`;
  return { ageMs, ageLabel, isStale: ageMs >= 86_400_000 };
}

function snapshotKey(userId: number, buildingId: number) {
  return `${SNAPSHOT_PREFIX}:${userId}:${buildingId}`;
}

function readSnapshot(key: string): OfflineWorkspaceSnapshot | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineWorkspaceSnapshot;
    return parsed.version === 1 && Number.isSafeInteger(parsed.userId) && parsed.building && parsed.data ? parsed : null;
  } catch {
    return null;
  }
}

export function saveOfflineWorkspaceSnapshot(input: Omit<OfflineWorkspaceSnapshot, "version" | "capturedAt"> & { buildingId: number }) {
  const snapshot: OfflineWorkspaceSnapshot = {
    version: 1,
    userId: input.userId,
    building: input.building,
    data: input.data,
    capturedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(snapshotKey(input.userId, input.buildingId), JSON.stringify(snapshot));
    window.localStorage.setItem(LAST_SNAPSHOT_KEY, `${input.userId}:${input.buildingId}`);
  } catch {
    // Browser storage can be unavailable or full; online behavior remains unchanged.
  }
}

export function loadOfflineWorkspaceSnapshot(userId: number, buildingId: number) {
  return readSnapshot(snapshotKey(userId, buildingId));
}

export function loadLastOfflineWorkspaceSnapshot(userId?: number | null) {
  try {
    const marker = window.localStorage.getItem(LAST_SNAPSHOT_KEY);
    if (!marker) return null;
    const [storedUserId, storedBuildingId] = marker.split(":").map(Number);
    if (!Number.isSafeInteger(storedUserId) || !Number.isSafeInteger(storedBuildingId)) return null;
    if (userId !== undefined && userId !== null && storedUserId !== userId) return null;
    const snapshot = readSnapshot(snapshotKey(storedUserId, storedBuildingId));
    return snapshot?.userId === storedUserId ? snapshot : null;
  } catch {
    return null;
  }
}

export function clearOfflineWorkspaceSnapshots(userId: number) {
  try {
    const prefix = `${SNAPSHOT_PREFIX}:${userId}:`;
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
    const marker = window.localStorage.getItem(LAST_SNAPSHOT_KEY);
    if (marker?.startsWith(`${userId}:`)) window.localStorage.removeItem(LAST_SNAPSHOT_KEY);
  } catch {
    // Clearing a local enhancement must not block normal sign-out.
  }
}
