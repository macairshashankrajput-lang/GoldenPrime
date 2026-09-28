import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { liveQueryOptions } from "@/lib/liveQuery";
import { loadOfflineWorkspaceSnapshot, saveOfflineWorkspaceSnapshot } from "@/lib/offlineSnapshot";
import { useAuth } from "@/_core/hooks/useAuth";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type BuildingOption = { id: number; name: string; address: string; city: string | null; landmark: string | null; contactPhone: string | null; imageUrl: string | null; mapUrl: string | null; ownerCutPercent: number; ownerMonthlyCutPaise: number; paymentBankName: string | null; paymentAccountName: string | null; paymentAccountNumber: string | null; paymentIfsc: string | null; paymentUpiId: string | null; paymentQrUrl: string | null; electricityRatePaise: number; rentDueDay: number };
type WorkspaceQuery = { data?: BuildingOption[]; isLoading: boolean };
type RouterOutput = inferRouterOutputs<AppRouter>;
type WorkspaceSnapshotData = RouterOutput["pg"]["operations"]["snapshot"];
type WorkspaceSnapshotQuery = { data: WorkspaceSnapshotData; isLoading: boolean };
type BuildingWorkspaceValue = {
  buildingsQuery: WorkspaceQuery;
  buildingId: number | null;
  building: BuildingOption | null;
  setBuildingId: (id: number) => void;
  isOfflineSnapshot: boolean;
  snapshotQuery: WorkspaceSnapshotQuery;
  isRefreshing: boolean;
};

const STORAGE_KEY = "golden-prime-active-building";
const BuildingWorkspaceContext = createContext<BuildingWorkspaceValue | null>(null);

export function BuildingWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const liveBuildingsQuery = trpc.pg.buildings.list.useQuery(undefined, { ...liveQueryOptions, enabled: isOnline });
  const [buildingId, setBuildingIdState] = useState<number | null>(() => {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isSafeInteger(stored) && stored > 0 ? stored : null;
  });
  const offlineSnapshot = useMemo(() => user && buildingId ? loadOfflineWorkspaceSnapshot(user.id, buildingId) : null, [buildingId, isOnline, user]);
  const fallbackBuilding = offlineSnapshot?.building as BuildingOption | undefined;
  const buildingsQuery: WorkspaceQuery = useMemo(() => ({
    data: liveBuildingsQuery.data ?? (fallbackBuilding ? [fallbackBuilding] : undefined),
    isLoading: isOnline && liveBuildingsQuery.isLoading,
  }), [fallbackBuilding, isOnline, liveBuildingsQuery.data, liveBuildingsQuery.isLoading]);

  useEffect(() => {
    const syncConnection = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", syncConnection);
    window.addEventListener("offline", syncConnection);
    return () => {
      window.removeEventListener("online", syncConnection);
      window.removeEventListener("offline", syncConnection);
    };
  }, []);

  useEffect(() => {
    if (buildingsQuery.isLoading) return;
    const available = buildingsQuery.data ?? [];
    if (available.length === 0) {
      setBuildingIdState(null);
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    if (!buildingId || !available.some(item => item.id === buildingId)) {
      setBuildingIdState(available[0].id);
    }
  }, [buildingId, buildingsQuery.data, buildingsQuery.isLoading]);

  useEffect(() => {
    if (buildingId) window.localStorage.setItem(STORAGE_KEY, String(buildingId));
  }, [buildingId]);

  const setBuildingId = (id: number) => {
    setBuildingIdState(id);
    window.localStorage.setItem(STORAGE_KEY, String(id));
  };
  const building = useMemo(() => buildingsQuery.data?.find(item => item.id === buildingId) ?? null, [buildingId, buildingsQuery.data]);
  const liveWorkspaceSnapshot = trpc.pg.operations.snapshot.useQuery({ buildingId: buildingId ?? 0 }, { enabled: Boolean(buildingId) && isOnline, ...liveQueryOptions });
  const isRefreshing = liveBuildingsQuery.isFetching || liveWorkspaceSnapshot.isFetching;
  const snapshotQuery: WorkspaceSnapshotQuery = useMemo(() => ({
    data: liveWorkspaceSnapshot.data ?? offlineSnapshot?.data as WorkspaceSnapshotData | undefined,
    isLoading: (isOnline && liveWorkspaceSnapshot.isLoading) || !(liveWorkspaceSnapshot.data ?? offlineSnapshot?.data),
  }) as WorkspaceSnapshotQuery, [isOnline, liveWorkspaceSnapshot, offlineSnapshot?.data]);

  useEffect(() => {
    if (!user || !building || !buildingId || !liveWorkspaceSnapshot.data) return;
    saveOfflineWorkspaceSnapshot({ userId: user.id, buildingId, building, data: liveWorkspaceSnapshot.data as Record<string, unknown> });
  }, [building, buildingId, liveWorkspaceSnapshot.data, user]);

  return <BuildingWorkspaceContext.Provider value={{ buildingsQuery, buildingId, building, setBuildingId, isOfflineSnapshot: Boolean(!isOnline && offlineSnapshot), snapshotQuery, isRefreshing }}>{children}</BuildingWorkspaceContext.Provider>;
}

export function useBuildingWorkspace() {
  const value = useContext(BuildingWorkspaceContext);
  if (!value) throw new Error("useBuildingWorkspace must be used inside BuildingWorkspaceProvider");
  return value;
}
