import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { requireBuildingAccess } from "./access";
import { getBuildingForUser } from "./db";

vi.mock("./db", () => ({ getBuildingForUser: vi.fn() }));

const mockedGetBuildingForUser = vi.mocked(getBuildingForUser);

describe("manager building operation access", () => {
  beforeEach(() => {
    mockedGetBuildingForUser.mockReset();
    mockedGetBuildingForUser.mockResolvedValue({ id: 12, name: "Test Building" } as never);
  });

  it("allows a Manager to access building-management operations", async () => {
    await expect(requireBuildingAccess({ id: 4, role: "manager" } as never, 12, "manageBuildings")).resolves.toMatchObject({ id: 12 });
    expect(mockedGetBuildingForUser).toHaveBeenCalledWith(12, 4, "manager");
  });

  it("allows a Manager to access room-management operations", async () => {
    await expect(requireBuildingAccess({ id: 4, role: "manager" } as never, 12, "manageRooms")).resolves.toMatchObject({ id: 12 });
  });

  it("forbids tenant access to building and room-management operations", async () => {
    await expect(requireBuildingAccess({ id: 9, role: "tenant" } as never, 12, "manageBuildings")).rejects.toBeInstanceOf(TRPCError);
    await expect(requireBuildingAccess({ id: 9, role: "tenant" } as never, 12, "manageRooms")).rejects.toBeInstanceOf(TRPCError);
  });
});
