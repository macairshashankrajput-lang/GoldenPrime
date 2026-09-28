import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("../client/src/pages/Dashboard.tsx", import.meta.url), "utf8");
const emptyStateSource = readFileSync(new URL("../client/src/components/AppStates.tsx", import.meta.url), "utf8");
const onboardingSource = readFileSync(new URL("../client/src/components/BuildingOnboardingModal.tsx", import.meta.url), "utf8");
const resetSource = readFileSync(new URL("../supabase/reset-operational-data.sql", import.meta.url), "utf8");

 describe("first-building onboarding", () => {
  it("offers actionable dashboard CTAs and opens onboarding", () => {
    expect(emptyStateSource).toContain("Set up first building");
    expect(emptyStateSource).toContain("Open Buildings");
    expect(dashboardSource).toContain("BuildingOnboardingModal");
    expect(dashboardSource).toContain("setShowOnboarding(true)");
  });

  it("creates the building then generates standard floors", () => {
    expect(onboardingSource).toContain("trpc.pg.buildings.create.useMutation");
    expect(onboardingSource).toContain("trpc.pg.operations.addGeneratedFloors.useMutation");
    expect(onboardingSource).toContain('name="floorCount"');
    expect(onboardingSource).toContain("Ground Floor, Floors 1–3, and Terrace");
    expect(onboardingSource).toContain("Create building & floors");
  });

  it("documents that reset preserves Manager and removes operational data", () => {
    expect(resetSource).toContain('WHERE "role" <> \'manager\'');
    expect(resetSource).toContain('DELETE FROM public."buildings"');
    expect(resetSource).toContain("Reset verification failed");
  });
});
