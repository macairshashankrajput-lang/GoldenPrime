import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGeneratedFloors } from "./db";

describe("automatic floor generation", () => {
  it("creates Ground Floor, the requested numbered floors, and Terrace", () => {
    expect(buildGeneratedFloors(3)).toEqual([
      { name: "Ground Floor", level: 0 },
      { name: "Floor 1", level: 1 },
      { name: "Floor 2", level: 2 },
      { name: "Floor 3", level: 3 },
      { name: "Terrace", level: 4 },
    ]);
  });

  it("supports a building with only Ground Floor and Terrace", () => {
    expect(buildGeneratedFloors(0)).toEqual([
      { name: "Ground Floor", level: 0 },
      { name: "Terrace", level: 1 },
    ]);
  });

  it("rejects fractional, negative, and excessive floor counts", () => {
    expect(() => buildGeneratedFloors(-1)).toThrow("between 0 and 200");
    expect(() => buildGeneratedFloors(1.5)).toThrow("whole number");
    expect(() => buildGeneratedFloors(201)).toThrow("between 0 and 200");
  });

  it("wires the Manager Rooms screen to the protected batch mutation", () => {
    const roomsSource = readFileSync(new URL("../client/src/pages/Rooms.tsx", import.meta.url), "utf8");
    const routerSource = readFileSync(new URL("./routers/pg.ts", import.meta.url), "utf8");
    expect(roomsSource).toContain("addGeneratedFloors.useMutation");
    expect(roomsSource).toContain("Ground Floor, Floor 1, Floor 2, Floor 3, and Terrace");
    expect(roomsSource).toContain("Number of floors");
    expect(routerSource).toContain("addGeneratedFloors: protectedProcedure");
    expect(routerSource).toContain('requireBuildingAccess(ctx.user, input.buildingId, "manageRooms")');
  });
});
