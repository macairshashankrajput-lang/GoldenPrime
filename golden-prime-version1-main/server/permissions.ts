export type AppRole = "admin" | "manager" | "helper" | "cook" | "tenant";

export type BuildingAction =
  | "read"
  | "manageBuildings"
  | "manageRooms"
  | "manageTenants"
  | "manageRent"
  | "manageElectricity"
  | "manageExpenses"
  | "manageReminders"
  | "manageStaff"
  | "export";

const permissions: Record<AppRole, Set<BuildingAction>> = {
  admin: new Set<BuildingAction>(),
  manager: new Set<BuildingAction>([
    "read",
    "manageBuildings",
    "manageRooms",
    "manageTenants",
    "manageRent",
    "manageElectricity",
    "manageExpenses",
    "manageReminders",
    "manageStaff",
    "export",
  ]),
  helper: new Set<BuildingAction>(["read", "manageRooms", "manageElectricity", "manageExpenses"]),
  cook: new Set<BuildingAction>(["read", "manageExpenses"]),
  tenant: new Set<BuildingAction>([]),
};

export function hasRolePermission(role: AppRole, action: BuildingAction) {
  return permissions[role].has(action);
}

export function getRoleLabel(role: AppRole) {
  return role === "admin" ? "Owner" : role[0].toUpperCase() + role.slice(1);
}

export function canCreateExpense(role: AppRole, category: string) {
  return role !== "cook" || category === "groceries" || category === "tiffin";
}
