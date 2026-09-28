import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("building-first Manager workspace boundaries", () => {
  it("redirects Owner and Manager entry routes to the building workspace", () => {
    const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    expect(appSource).toContain('user?.role === "admin" || user?.role === "manager"');
    expect(appSource).toContain('<Redirect to="/buildings" />');
  });

  it("uses one shared persistent workspace context instead of page-local building state", () => {
    const contextSource = readFileSync(new URL("../client/src/contexts/BuildingWorkspaceContext.tsx", import.meta.url), "utf8");
    const hookSource = readFileSync(new URL("../client/src/hooks/useActiveBuilding.ts", import.meta.url), "utf8");
    expect(contextSource).toContain("golden-prime-active-building");
    expect(contextSource).toContain("BuildingWorkspaceProvider");
    expect(contextSource).toContain("window.localStorage.setItem(STORAGE_KEY, String(buildingId))");
    expect(contextSource).toContain("window.localStorage.setItem(STORAGE_KEY, String(id))");
    expect(hookSource).toContain("useBuildingWorkspace");
  });

  it("exposes tenant credential creation, document metadata, and revocation procedures", () => {
    const routerSource = readFileSync(new URL("./routers/pg.ts", import.meta.url), "utf8");
    expect(routerSource).toContain("password: z.string().min(8)");
    expect(routerSource).toContain("identityDocumentUrl");
    expect(routerSource).toContain("revokeTenantCredentials");
  });

  it("keeps building and room destructive operations behind building access", () => {
    const routerSource = readFileSync(new URL("./routers/pg.ts", import.meta.url), "utf8");
    expect(routerSource).toContain('requireBuildingAccess(ctx.user, input.id, "manageBuildings")');
    expect(routerSource).toContain('requireBuildingAccess(ctx.user, input.buildingId, "manageRooms")');
  });

  it("uses one mobile workspace header and a reduced-motion-safe route transition wrapper", () => {
    const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    const layoutSource = readFileSync(new URL("../client/src/components/DashboardLayout.tsx", import.meta.url), "utf8");
    const stylesSource = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
    expect(appSource).toContain("WorkspaceRoutes");
    expect(appSource).toContain('className="app-page-transition"');
    expect((layoutSource.match(/sticky top-0/g) ?? []).length).toBe(1);
    expect(layoutSource).toContain('SidebarTrigger className={`h-9 w-9 rounded-lg bg-background ${isMobile ? "inline-flex" : "hidden"}`}');
    expect(stylesSource).toContain("prefers-reduced-motion: reduce");
    expect(stylesSource).toContain("app-page-enter");
  });
});

export {};
