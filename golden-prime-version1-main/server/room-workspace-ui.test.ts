import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("shared-room workspace UI", () => {
  const roomsSource = readFileSync(new URL("../client/src/pages/Rooms.tsx", import.meta.url), "utf8");
  const tenantsSource = readFileSync(new URL("../client/src/pages/Tenants.tsx", import.meta.url), "utf8");

  it("renders filled-bed and available-bed occupancy indicators for room cards", () => {
    expect(roomsSource).toContain("beds filled");
    expect(roomsSource).toContain("bed${availableBeds === 1 ? \"\" : \"s\"} open");
    expect(roomsSource).toContain("occupancyPercent");
  });

  it("filters tenant cards by all configured sharing room types", () => {
    expect(tenantsSource).toContain('type RoomTypeFilter = typeof roomTypeFilterOptions[number]["value"]');
    expect(tenantsSource).toContain('{ value: "individual", label: "Individual room" }');
    expect(tenantsSource).toContain('{ value: "coliving", label: "Co-living" }');
    expect(tenantsSource).toContain("const matchesRoomType = roomTypeFilter === \"all\" || room?.roomType === roomTypeFilter");
  });

  it("uses the shared accessible deletion dialog instead of browser-native confirmations", () => {
    const buildingsSource = readFileSync(new URL("../client/src/pages/Buildings.tsx", import.meta.url), "utf8");
    expect(buildingsSource).toContain("useDeletionSafety");
    expect(buildingsSource).toContain("requestDelete({ label:");
    expect(roomsSource).toContain("useDeletionSafety");
    expect(roomsSource).toContain("const requestRoomDeletion");
    expect(tenantsSource).toContain("const { requestDelete } = useDeletionSafety()");
    expect(`${buildingsSource}\n${roomsSource}\n${tenantsSource}`).not.toContain("window.confirm");
  });

  it("keeps mobile room-type controls horizontally reachable and limits non-essential motion", () => {
    const stylesSource = readFileSync(new URL("../client/src/index.css", import.meta.url), "utf8");
    expect(tenantsSource).toContain("mobile-scroll-controls");
    expect(tenantsSource).toContain("motion-stagger");
    expect(roomsSource).toContain("motion-stagger");
    expect(stylesSource).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(stylesSource).toContain(".mobile-scroll-controls");
  });

  it("includes rooms with any open bed when Vacant Only is enabled", () => {
    expect(roomsSource).toContain("const [vacantOnly, setVacantOnly] = useState(false)");
    expect(roomsSource).toContain("(roomOccupancy.get(room.id) ?? 0) < room.capacity");
    expect(roomsSource).toContain("Vacant Only");
  });

  it("matches tenant search against tenant name, phone, and active room number", () => {
    expect(tenantsSource).toContain("const [tenantSearch, setTenantSearch] = useState(\"\")");
    expect(tenantsSource).toContain("tenant.fullName.toLocaleLowerCase().includes(normalizedSearch)");
    expect(tenantsSource).toContain("tenant.phone.toLocaleLowerCase().includes(normalizedSearch)");
    expect(tenantsSource).toContain("room?.number.toLocaleLowerCase().includes(normalizedSearch)");
  });

  it("supports guided room setup and direct tenant allocation from every room with an available bed", () => {
    expect(roomsSource).toContain("Guided setup");
    expect(roomsSource).toContain("Create room & tenant");
    expect(roomsSource).toContain("Allocate tenant");
    expect(roomsSource).toContain("Create new tenant for this room");
    expect(roomsSource).toContain("allocateTenantWithServices");
  });

  it("prevents selecting already allocated tenants and persists profile plus allocation edits together", () => {
    expect(tenantsSource).toContain("const unallocatedActiveTenants");
    expect(tenantsSource).toContain("Choose unallocated tenant");
    expect(tenantsSource).toContain("await updateTenant.mutateAsync");
    expect(tenantsSource).toContain("await updateAllocation.mutateAsync");
    expect(tenantsSource).toContain("Reset tenant login password");
    expect(tenantsSource).toContain("resetTenantCredentials.mutate({");
    expect(tenantsSource).toContain("tenantEditRef.current?.scrollIntoView");
  });

  it("offers a guarded room-to-room transfer action for active tenant allocations", () => {
    expect(tenantsSource).toContain("Transfer room");
    expect(tenantsSource).toContain("Choose room with an open bed");
    expect(tenantsSource).toContain("transferTenant.mutate");
    expect(tenantsSource).toContain("This preserves the current allocation and payment history");
    expect(tenantsSource).toContain("Automatically prorate this month’s rent.");
    expect(tenantsSource).toContain("applyProration: transferDraft.applyProration");
  });

  it("renders a live rupee proration preview that updates from transfer date and destination rent", () => {
    expect(tenantsSource).toContain("Live proration preview");
    expect(tenantsSource).toContain("sourceMonthlyRentPaise={allocation.monthlyRentPaise}");
    expect(tenantsSource).toContain("destinationMonthlyRentRupees={transferDraft.monthlyRent}");
    expect(tenantsSource).toContain("onChange={event => updateTransferDraft({ effectiveDate: event.target.value })}");
    expect(tenantsSource).toContain("onChange={event => updateTransferDraft({ monthlyRent: event.target.value })}");
  });

  it("shows each Tenant’s room transfer timeline with room, rent, and proration details", () => {
    expect(tenantsSource).toContain("Room transfer history");
    expect(tenantsSource).toContain("snapshot.data.tenantTransfers.filter");
    expect(tenantsSource).toContain("Prorated adjustment: source");
    expect(tenantsSource).toContain("No mid-month rent adjustment was applied.");
  });
});
