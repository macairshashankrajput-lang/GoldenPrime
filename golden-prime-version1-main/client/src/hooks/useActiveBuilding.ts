import { useBuildingWorkspace } from "@/contexts/BuildingWorkspaceContext";

export function useActiveBuilding() {
  return useBuildingWorkspace();
}
