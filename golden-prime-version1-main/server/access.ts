import { TRPCError } from "@trpc/server";
import type { User } from "../drizzle-pg/schema";
import { getBuildingForUser } from "./db";
import { type AppRole, type BuildingAction, hasRolePermission } from "./permissions";

export async function requireBuildingAccess(
  user: User,
  buildingId: number,
  action: BuildingAction,
) {
  const role = user.role as AppRole;
  if (!hasRolePermission(role, action)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your role cannot perform this action." });
  }

  const building = await getBuildingForUser(buildingId, user.id, role);
  if (!building) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this building." });
  }
  return building;
}
