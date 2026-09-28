import { describe, expect, it, vi } from "vitest";
import type { User } from "../drizzle-pg/schema";

const mocked = vi.hoisted(() => ({
  getBuildingForUser: vi.fn(),
  getReceiptReviewHistory: vi.fn(),
  listReceiptReviewers: vi.fn(),
  createBuilding: vi.fn(),
  createOrLinkBuildingOwner: vi.fn(),
  createElectricityOverdueReminder: vi.fn(),
  ensureMonthlyRentCycles: vi.fn(),
  refreshManagerCollectionNotifications: vi.fn(),
  getManagerNotifications: vi.fn(),
  markManagerNotificationsRead: vi.fn(),
  triggerRentPaymentReminder: vi.fn(),
  updateBuilding: vi.fn(),
  deleteBuilding: vi.fn(),
  addStaffAssignment: vi.fn(),
  addRoom: vi.fn(),
  createRoomWithTenantSetup: vi.fn(),
  createAllocationWithServices: vi.fn(),
  createTenantWithAllocationAndServices: vi.fn(),
  transferActiveTenant: vi.fn(),
  updateRoom: vi.fn(),
  deleteRoom: vi.fn(),
  recordElectricityBill: vi.fn(),
  recordTenantChargePayment: vi.fn(),
  reviewTenantPaymentReceipt: vi.fn(),
  updateElectricityBill: vi.fn(),
  updateTenant: vi.fn(),
  resetTenantCredentials: vi.fn(),
  vacateAllocation: vi.fn(),
  archiveTenant: vi.fn(),
  deleteTenant: vi.fn(),
  createServiceCharge: vi.fn(),
  createExpense: vi.fn(),
  createOperatingCost: vi.fn(),
  updateOperatingCost: vi.fn(),
  updateRentPayment: vi.fn(),
  deleteOperatingCost: vi.fn(),
  markReminderComplete: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, ...mocked };
});

import { pgRouter } from "./routers/pg";

const manager = { id: 7, role: "manager", name: "Manager" } as User;
const owner = { id: 9, role: "admin", name: "Owner" } as User;
const cook = { id: 10, role: "cook", name: "Cook" } as User;
const tenant = { id: 8, role: "tenant", name: "Tenant" } as User;
const context = (user: User) => ({ user, req: {} as never, res: {} as never });

describe("Manager building and room procedures", () => {
  it("creates a building and assigns the Manager to it", async () => {
    mocked.createBuilding.mockResolvedValueOnce(44);
    mocked.createOrLinkBuildingOwner.mockResolvedValueOnce(19);
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.buildings.create({ name: "New PG", address: "123 Main Street", city: "Noida", ownerName: "New Owner", ownerPhone: "9999999999", ownerPassword: "ownerpass123", electricityRatePaise: 1200 })).resolves.toEqual({ buildingId: 44 });
    expect(mocked.createOrLinkBuildingOwner).toHaveBeenCalledWith(expect.objectContaining({ name: "New Owner", phone: "9999999999" }));
    expect(mocked.createBuilding).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 19 }));
    expect(mocked.addStaffAssignment).toHaveBeenCalledWith({ buildingId: 44, userId: 7 });
  });

  it("updates and deletes buildings for a Manager", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.buildings.update({ id: 44, name: "Updated PG", address: "123 Main Street", city: "Noida", landmark: "Near Metro", contactPhone: "9990636862", imageUrl: "https://example.com/building.jpg", mapUrl: "https://maps.google.com/?q=Golden+Prime", ownerCutPercent: 15, electricityRatePaise: 1200 })).resolves.toEqual({ success: true });
    await expect(caller.buildings.delete({ id: 44 })).resolves.toEqual({ success: true });
    expect(mocked.updateBuilding).toHaveBeenCalledWith(expect.objectContaining({ id: 44, name: "Updated PG", paymentBankName: null, paymentAccountName: null, paymentAccountNumber: null, paymentIfsc: null, paymentUpiId: null, paymentQrUrl: null }));
    expect(mocked.deleteBuilding).toHaveBeenCalledWith(44);
  });

  it("prevents the restricted Owner from submitting a building profile update", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    const caller = pgRouter.createCaller(context(owner));
    await expect(caller.buildings.update({ id: 44, name: "Golden Prime PG", address: "Sector 62", city: "Noida", landmark: "Near Metro", contactPhone: "7668992940", imageUrl: "", mapUrl: "", ownerCutPercent: 0, electricityRatePaise: 1200 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns a protected conflict when building deletion is blocked", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    mocked.deleteBuilding.mockRejectedValueOnce(new Error("Building has operational records"));
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.buildings.delete({ id: 44 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("creates and updates rooms for a Manager", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    mocked.getDb.mockResolvedValue({ select: () => ({ from: () => ({ where: async () => [] }) }) });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.operations.addRoom({ buildingId: 44, floorId: null, number: "101", capacity: 1, roomType: "single", airConditioning: "ac", balcony: "balcony", imageUrl: "https://example.com/room.jpg", defaultRentPaise: 1350000 })).resolves.toEqual({ success: true });
    await expect(caller.operations.updateRoom({ id: 91, buildingId: 44, floorId: null, number: "102", capacity: 1, roomType: "single", airConditioning: "non_ac", balcony: "non_balcony", imageUrl: "", defaultRentPaise: 1350000 })).resolves.toEqual({ success: true });
    mocked.deleteRoom.mockResolvedValueOnce(undefined);
    await expect(caller.operations.deleteRoom({ id: 91, buildingId: 44 })).resolves.toEqual({ success: true });
    expect(mocked.addRoom).toHaveBeenCalledWith(expect.objectContaining({ balcony: "balcony", imageUrl: "https://example.com/room.jpg" }));
    expect(mocked.updateRoom).toHaveBeenCalledWith(expect.objectContaining({ balcony: "non_balcony", imageUrl: null }));
  });

  it("derives double-sharing room capacity from room type instead of trusting a stale client capacity", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.operations.addRoom({ buildingId: 44, floorId: null, number: "201", capacity: 1, roomType: "double", airConditioning: "non_ac", balcony: "non_balcony", imageUrl: "", defaultRentPaise: 1800000 })).resolves.toEqual({ success: true });
    expect(mocked.addRoom).toHaveBeenCalledWith(expect.objectContaining({ roomType: "double", capacity: 2 }));
  });

  it("derives four-sharing room capacity from room type", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.operations.addRoom({ buildingId: 44, floorId: null, number: "401", capacity: 1, roomType: "four", airConditioning: "non_ac", balcony: "non_balcony", imageUrl: "", defaultRentPaise: 0 })).resolves.toEqual({ success: true });
    expect(mocked.addRoom).toHaveBeenCalledWith(expect.objectContaining({ roomType: "four", capacity: 4 }));
  });

  it("creates a room, first tenant, allocation, agreed rent, and services together", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    mocked.createRoomWithTenantSetup.mockResolvedValue({ roomId: 91, tenantId: 71, allocationId: 81 });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.operations.setupRoomWithTenant({ buildingId: 44, floorId: null, number: "301", roomType: "double", airConditioning: "ac", balcony: "balcony", imageUrl: "", tenant: { fullName: "Shashank", phone: "6307500844", password: "securepass", email: "", emergencyContactName: "", emergencyContactPhone: "", address: "", identityDocumentUrl: "" }, allocation: { moveInDate: "2026-08-23", bedLabel: "A", monthlyRentPaise: 1350000, depositPaise: 500000 }, services: [{ serviceType: "tiffin", monthlyChargePaise: 300000, notes: "Monthly tiffin" }] })).resolves.toEqual({ roomId: 91, tenantId: 71, allocationId: 81 });
    expect(mocked.createRoomWithTenantSetup).toHaveBeenCalledWith(expect.objectContaining({ buildingId: 44, number: "301", roomType: "double", capacity: 2, defaultRentPaise: 1350000, allocation: expect.objectContaining({ monthlyRentPaise: 1350000 }), services: [expect.objectContaining({ serviceType: "tiffin", monthlyChargePaise: 300000, createdBy: 7 })] }));
  });

  it("creates and allocates a new Tenant directly into an existing Room", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    mocked.createTenantWithAllocationAndServices.mockResolvedValue({ tenantId: 72, allocationId: 82 });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.operations.createTenantForRoom({ buildingId: 44, roomId: 91, tenant: { fullName: "Resident", phone: "6307500845", password: "securepass", email: "", emergencyContactName: "", emergencyContactPhone: "", address: "", identityDocumentUrl: "" }, allocation: { moveInDate: "2026-08-23", bedLabel: "B", monthlyRentPaise: 1200000, depositPaise: 400000 }, services: [{ serviceType: "water_bottle", monthlyChargePaise: 50000, notes: "20L jar" }] })).resolves.toEqual({ tenantId: 72, allocationId: 82 });
    expect(mocked.createTenantWithAllocationAndServices).toHaveBeenCalledWith(expect.objectContaining({ buildingId: 44, roomId: 91, allocation: expect.objectContaining({ monthlyRentPaise: 1200000 }), services: [expect.objectContaining({ serviceType: "water_bottle", createdBy: 7 })] }));
  });

  it("transfers an active Tenant to an available destination room while preserving a new allocation contract", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    mocked.transferActiveTenant.mockResolvedValue({ destinationAllocationId: 83, sourceRoomId: 91 });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.operations.transferTenant({ buildingId: 44, allocationId: 81, destinationRoomId: 92, effectiveDate: "2026-08-23", bedLabel: "B", monthlyRentPaise: 1400000, depositPaise: 500000, applyProration: true })).resolves.toEqual({ destinationAllocationId: 83, sourceRoomId: 91 });
    expect(mocked.transferActiveTenant).toHaveBeenCalledWith({ buildingId: 44, allocationId: 81, destinationRoomId: 92, effectiveDate: "2026-08-23", bedLabel: "B", monthlyRentPaise: 1400000, depositPaise: 500000, applyProration: true, recordedBy: 7 });
  });

  it("lets a Manager correct a tenant rent payment and derives the settled status", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    const caller = pgRouter.createCaller(context(manager));
    const expectedUpdatedAt = new Date("2026-08-08T00:00:00.000Z");
    await expect(caller.rent.update({ id: 51, buildingId: 44, expectedUpdatedAt, dueDate: "2026-08-10", expectedAmountPaise: 800000, paidAmountPaise: 800000, paidOn: "2026-08-09", paymentMethod: "upi", notes: "UPI settled", receiptUrl: "https://example.com/rent-receipt.jpg" })).resolves.toEqual({ status: "paid" });
    expect(mocked.updateRentPayment).toHaveBeenCalledWith(expect.objectContaining({ id: 51, buildingId: 44, paidAmountPaise: 800000, status: "paid", paidOn: "2026-08-09", paymentMethod: "upi", recordedBy: 7 }));
  });

  it("records pending electricity and derives paid collection status on update", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, electricityRatePaise: 1200 });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.electricity.upsert({ buildingId: 44, roomId: 91, billingMonth: "2026-08", previousReading: 100, currentReading: 150, dueDate: "2026-08-10" })).resolves.toMatchObject({ unitsConsumed: 50, billAmountPaise: 60000 });
    expect(mocked.recordElectricityBill).toHaveBeenCalledWith(expect.objectContaining({ paidAmountPaise: 0, status: "pending", paidOn: null, paymentMethod: null, meterImageUrl: null, receiptUrl: null }));
    await expect(caller.electricity.update({ id: 61, buildingId: 44, expectedUpdatedAt: new Date("2026-08-08T00:00:00.000Z"), previousReading: 100, currentReading: 150, paidAmountPaise: 60000, paidOn: "2026-08-08", paymentMethod: "upi", meterImageUrl: "https://example.com/meter.jpg", receiptUrl: "https://example.com/receipt.jpg", dueDate: "2026-08-10" })).resolves.toMatchObject({ status: "paid", reminderResolved: true });
    expect(mocked.updateElectricityBill).toHaveBeenCalledWith(expect.objectContaining({ paidAmountPaise: 60000, status: "paid", paidOn: "2026-08-08", paymentMethod: "upi", meterImageUrl: "https://example.com/meter.jpg", receiptUrl: "https://example.com/receipt.jpg" }));
  });

  it("records a selected tenant’s split-charge payment without crossing buildings", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    mocked.recordTenantChargePayment.mockResolvedValue({ status: "partial" });
    const caller = pgRouter.createCaller(context(manager));
    const expectedUpdatedAt = new Date("2026-08-08T00:00:00.000Z");
    await expect(caller.tenantCharges.recordPayment({ id: 72, buildingId: 44, expectedUpdatedAt, paidAmountPaise: 25000, paidOn: "2026-08-09", paymentMethod: "bank_transfer", receiptUrl: "https://example.com/share-receipt.jpg" })).resolves.toEqual({ status: "partial" });
    expect(mocked.recordTenantChargePayment).toHaveBeenCalledWith({ id: 72, buildingId: 44, expectedUpdatedAt, paidAmountPaise: 25000, paidOn: "2026-08-09", paymentMethod: "bank_transfer", receiptUrl: "https://example.com/share-receipt.jpg", recordedBy: 7 });
  });

  it("allows a Manager to approve or reject a pending Tenant receipt within the selected building", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    mocked.reviewTenantPaymentReceipt.mockResolvedValueOnce({ status: "approved" }).mockResolvedValueOnce({ status: "rejected" });
    const caller = pgRouter.createCaller(context(manager));
    const expectedUpdatedAt = new Date("2026-08-10T00:00:00.000Z");
    await expect(caller.receiptReviews.decide({ type: "rent", billId: 72, buildingId: 44, expectedUpdatedAt, status: "approved", reviewNote: "Proof matches the UPI transfer." })).resolves.toEqual({ status: "approved" });
    await expect(caller.receiptReviews.decide({ type: "tenant_charge", billId: 73, buildingId: 44, expectedUpdatedAt, status: "rejected", reviewNote: "Please attach the complete receipt." })).resolves.toEqual({ status: "rejected" });
    expect(mocked.reviewTenantPaymentReceipt).toHaveBeenNthCalledWith(1, { type: "rent", billId: 72, buildingId: 44, expectedUpdatedAt, status: "approved", reviewNote: "Proof matches the UPI transfer.", reviewedBy: 7 });
    expect(mocked.reviewTenantPaymentReceipt).toHaveBeenNthCalledWith(2, { type: "tenant_charge", billId: 73, buildingId: 44, expectedUpdatedAt, status: "rejected", reviewNote: "Please attach the complete receipt.", reviewedBy: 7 });
  });

  it("returns only the selected building’s past receipt decisions to a Manager", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    const history = [{ type: "rent", id: 72, status: "approved", title: "Rent · 2026-08", subject: "Shashank" }];
    mocked.getReceiptReviewHistory.mockResolvedValue(history);
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.receiptReviews.history({ buildingId: 44, tenantId: 12, reviewerId: 7, reviewedFrom: "2026-08-01", reviewedTo: "2026-08-31", paymentMethod: "upi", amountMinPaise: 25000, amountMaxPaise: 75000 })).resolves.toEqual(history);
    expect(mocked.getReceiptReviewHistory).toHaveBeenCalledWith({ buildingId: 44, tenantId: 12, reviewerId: 7, reviewedFrom: new Date("2026-08-01T00:00:00.000Z"), reviewedTo: new Date("2026-08-31T23:59:59.999Z"), paymentMethod: "upi", amountMinPaise: 25000, amountMaxPaise: 75000 });
  });

  it("lists only reviewers who have audited receipt proof in the selected building", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    mocked.listReceiptReviewers.mockResolvedValue([{ id: 7, name: "Manager" }, { id: 9, name: "Owner" }]);
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.receiptReviews.reviewers({ buildingId: 44 })).resolves.toEqual([{ id: 7, name: "Manager" }, { id: 9, name: "Owner" }]);
    expect(mocked.listReceiptReviewers).toHaveBeenCalledWith(44);
  });

  it("rejects an inverted receipt-review audit date range", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.receiptReviews.history({ buildingId: 44, reviewedFrom: "2026-08-31", reviewedTo: "2026-08-01" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an inverted receipt-review audit amount range", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.receiptReviews.history({ buildingId: 44, amountMinPaise: 75000, amountMaxPaise: 25000 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("requires a Manager rejection note before rejecting Tenant payment proof", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.receiptReviews.decide({ type: "electricity", billId: 74, buildingId: 44, expectedUpdatedAt: new Date("2026-08-10T00:00:00.000Z"), status: "rejected" })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "A rejection note is required before rejecting tenant payment proof." });
    expect(mocked.reviewTenantPaymentReceipt).not.toHaveBeenCalledWith(expect.objectContaining({ billId: 74 }));
  });

  it("lets a Manager trigger a selected building rent reminder for a pending payment", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    mocked.triggerRentPaymentReminder.mockResolvedValue({ created: true, title: "Rent due · 2026-08" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.rent.triggerReminder({ id: 63, buildingId: 44 })).resolves.toEqual({ created: true, title: "Rent due · 2026-08" });
    expect(mocked.triggerRentPaymentReminder).toHaveBeenCalledWith({ id: 63, buildingId: 44, createdBy: 7 });
  });

  it("lets a Manager reset an active tenant phone-password credential within the selected building", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.operations.resetTenantCredentials({ tenantId: 71, buildingId: 44, password: "newsecurepass" })).resolves.toEqual({ success: true });
    expect(mocked.resetTenantCredentials).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 71, buildingId: 44, passwordHash: expect.stringContaining(":") }));
  });

  it("generates selected-building monthly rent cycles without overwriting manual payment data", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    mocked.ensureMonthlyRentCycles.mockResolvedValue({ created: 1, rentMonth: "2026-08" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.rent.generateCycle({ buildingId: 44, rentMonth: "2026-08" })).resolves.toEqual({ created: 1, rentMonth: "2026-08" });
    expect(mocked.ensureMonthlyRentCycles).toHaveBeenCalledWith({ buildingId: 44, rentMonth: "2026-08", createdBy: 7 });
  });

  it("keeps Manager notification reads and refreshes scoped to the selected building", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    mocked.getManagerNotifications.mockResolvedValue([{ id: 91, buildingId: 44, status: "unread" }]);
    mocked.refreshManagerCollectionNotifications.mockResolvedValue({ refreshed: 2, cutoffDate: "2026-08-25" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.notifications.list({ buildingId: 44 })).resolves.toEqual([{ id: 91, buildingId: 44, status: "unread" }]);
    await expect(caller.notifications.markRead({ buildingId: 44, notificationIds: [91] })).resolves.toEqual({ success: true });
    await expect(caller.notifications.refresh({ buildingId: 44 })).resolves.toEqual({ refreshed: 2, cutoffDate: "2026-08-25" });
    expect(mocked.markManagerNotificationsRead).toHaveBeenCalledWith({ buildingId: 44, notificationIds: [91] });
    expect(mocked.refreshManagerCollectionNotifications).toHaveBeenCalledWith(expect.objectContaining({ buildingId: 44 }));
  });

  it("creates an idempotent overdue electricity reminder for a Manager", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, electricityRatePaise: 1200 });
    mocked.createElectricityOverdueReminder.mockResolvedValue({ created: true, title: "Electricity due · Room 101 · 2026-08" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.electricity.createOverdueReminder({ billId: 61, buildingId: 44 })).resolves.toEqual({ created: true, title: "Electricity due · Room 101 · 2026-08" });
    expect(mocked.createElectricityOverdueReminder).toHaveBeenCalledWith({ billId: 61, buildingId: 44, createdBy: 7 });
  });

  it("allows a Manager to complete a tenant follow-up reminder", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.reminders.complete({ buildingId: 44, reminderId: 61 })).resolves.toEqual({ success: true });
    expect(mocked.markReminderComplete).toHaveBeenCalledWith(61, 44);
  });

  it("creates a building service charge for the selected building", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.expenses.serviceChargeCreate({ buildingId: 44, name: "Wi-Fi", amountPaise: 25000, billingCycle: "monthly", dueDay: 5, notes: "Shared internet" })).resolves.toEqual({ success: true });
    expect(mocked.createServiceCharge).toHaveBeenCalledWith({ buildingId: 44, name: "Wi-Fi", amountPaise: 25000, billingCycle: "monthly", dueDay: 5, notes: "Shared internet", createdBy: 7 });
  });

  it("forbids a Cook from configuring recurring building charges", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    const caller = pgRouter.createCaller(context(cook));
    await expect(caller.expenses.serviceChargeCreate({ buildingId: 44, name: "Wi-Fi", amountPaise: 25000, billingCycle: "monthly", dueDay: 5, notes: "Shared internet" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("records an expense receipt reference for the selected building", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.expenses.create({ buildingId: 44, category: "labor", amountPaise: 185000, expenseDate: "2026-08-22", notes: "Plumber visit", receiptUrl: "https://example.com/plumber-receipt.jpg" })).resolves.toEqual({ success: true });
    expect(mocked.createExpense).toHaveBeenCalledWith({ buildingId: 44, roomId: null, tenantId: null, liabilityMode: "building", category: "labor", amountPaise: 185000, expenseDate: "2026-08-22", notes: "Plumber visit", receiptUrl: "https://example.com/plumber-receipt.jpg", createdBy: 7 });
  });

  it("records Manager-controlled helper, supply, and maintenance costs with a payable balance", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.expenses.operatingCostCreate({ buildingId: 44, kind: "staff", category: "helper_salary", title: "August helper salary", payeeName: "Ravi", amountPaise: 1200000, paidAmountPaise: 500000, workStatus: "complete", costDate: "2026-08-22", dueDate: "2026-08-31", receiptUrl: "", notes: "Cash advance recorded" })).resolves.toEqual({ success: true });
    expect(mocked.createOperatingCost).toHaveBeenCalledWith(expect.objectContaining({ kind: "staff", category: "helper_salary", payeeName: "Ravi", paidAmountPaise: 500000, workStatus: "complete", createdBy: 7 }));
  });

  it("forbids a Cook from changing Manager-controlled operating costs", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    const caller = pgRouter.createCaller(context(cook));
    await expect(caller.expenses.operatingCostCreate({ buildingId: 44, kind: "supplies", category: "utensils", title: "Steel utensils", amountPaise: 400000, paidAmountPaise: 0, costDate: "2026-08-22", receiptUrl: "" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("offboards tenants and protects historical tenant records from deletion", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.operations.archiveTenant({ tenantId: 12, buildingId: 44, moveOutDate: "2026-08-31" })).resolves.toEqual({ success: true });
    expect(mocked.archiveTenant).toHaveBeenCalledWith({ tenantId: 12, buildingId: 44, moveOutDate: "2026-08-31" });
    mocked.deleteTenant.mockRejectedValueOnce(new Error("Tenant history must be preserved"));
    await expect(caller.operations.deleteTenant({ tenantId: 12, buildingId: 44 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps the tenant login phone synchronized when a Manager edits the tenant profile", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.operations.updateTenant({ id: 12, buildingId: 44, fullName: "Shashank", phone: "+91 63075 00844", email: "", emergencyContactName: "", emergencyContactPhone: "", address: "", identityDocumentUrl: "", status: "active" })).resolves.toEqual({ success: true });
    expect(mocked.updateTenant).toHaveBeenCalledWith(expect.objectContaining({ id: 12, buildingId: 44, phone: "6307500844" }));
  });

  it("passes the selected-building scope into allocation move-outs", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "Golden Prime PG" });
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.operations.vacateTenant({ allocationId: 73, buildingId: 44, moveOutDate: "2026-08-31" })).resolves.toEqual({ success: true });
    expect(mocked.vacateAllocation).toHaveBeenCalledWith({ allocationId: 73, buildingId: 44, moveOutDate: "2026-08-31" });
  });

  it("rejects cross-building move-outs before the allocation helper can change a record", async () => {
    mocked.getBuildingForUser.mockResolvedValue(null);
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.operations.vacateTenant({ allocationId: 73, buildingId: 999, moveOutDate: "2026-08-31" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocked.vacateAllocation).not.toHaveBeenCalledWith(expect.objectContaining({ buildingId: 999 }));
  });

  it("rejects a stale electricity correction instead of overwriting a newer device update", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, electricityRatePaise: 1200 });
    mocked.updateElectricityBill.mockRejectedValueOnce(new Error("This electricity record changed on another device. Review the latest record before saving again."));
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.electricity.update({ id: 61, buildingId: 44, expectedUpdatedAt: new Date("2026-08-08T00:00:00.000Z"), previousReading: 100, currentReading: 150, paidAmountPaise: 0, meterImageUrl: "", receiptUrl: "", dueDate: "2026-08-10" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("returns a protected conflict when room deletion is blocked", async () => {
    mocked.getBuildingForUser.mockResolvedValue({ id: 44, name: "New PG" });
    mocked.deleteRoom.mockRejectedValueOnce(new Error("Room has billing history"));
    const caller = pgRouter.createCaller(context(manager));
    await expect(caller.operations.deleteRoom({ id: 91, buildingId: 44 })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("forbids tenant destructive operations", async () => {
    const caller = pgRouter.createCaller(context(tenant));
    await expect(caller.buildings.create({ name: "Blocked PG", address: "123 Main Street", city: "Noida", ownerName: "Blocked Owner", ownerPhone: "9999999999", electricityRatePaise: 1200 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.operations.deleteRoom({ id: 91, buildingId: 44 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

export {};
