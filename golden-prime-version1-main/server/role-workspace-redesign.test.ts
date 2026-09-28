import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("role workspace redesign", () => {
  it("routes Owner sessions to the dedicated restricted summary", () => {
    const app = read("client/src/App.tsx");
    const owner = read("client/src/pages/OwnerOverview.tsx");
    expect(app).toContain('if (user.role === "admin") return <OwnerOverview />');
    expect(owner).toContain("pg.owner.overview.useQuery");
    expect(owner).toContain("pg.owner.confirmSettlement");
    expect(owner).toContain("Room and resident detail");
  });

  it("exposes dedicated Manager collections, vacancy, profit, and payment-receiving routes", () => {
    const app = read("client/src/App.tsx");
    const nav = read("client/src/components/DashboardLayout.tsx");
    ["/collections", "/vacancies", "/profit", "/payment-settings"].forEach(path => expect(app).toContain(path));
    ["Collections", "Vacancies", "Profit", "Payment receiving"].forEach(label => expect(nav).toContain(label));
  });

  it("hands a vacancy allocation action to the selected room form through the browser query string", () => {
    const rooms = read("client/src/pages/Rooms.tsx");
    const vacancies = read("client/src/pages/Vacancies.tsx");
    expect(vacancies).toContain('setLocation(`/rooms?allocate=${room.id}`)');
    expect(rooms).toContain('new URLSearchParams(window.location.search).get("allocate")');
    expect(rooms).toContain("setAllocatingRoomId(room.id)");
  });

  it("keeps building share content free of financial and payment instructions", () => {
    const buildings = read("client/src/pages/Buildings.tsx");
    const shareFunction = buildings.slice(buildings.indexOf("const shareBuilding"), buildings.indexOf("const getQrPayload"));
    expect(shareFunction).not.toContain("electricityRatePaise");
    expect(shareFunction).not.toContain("paymentUpiId");
    expect(shareFunction).not.toContain("paymentAccountNumber");
  });
});
