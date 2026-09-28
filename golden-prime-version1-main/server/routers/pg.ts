import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { roomAllocations, rooms, tenants } from "../../drizzle-pg/schema";
import { requireBuildingAccess } from "../access";
import { hashPassword, normalizePhone, verifyPassword } from "../auth";
import {
  addFloor,
  addGeneratedFloors,
  addRoom,
  addStaffAssignment,
  createAllocation,
  createAllocationWithServices,
  createBuilding,
  createOrLinkBuildingOwner,
  createElectricityOverdueReminder,
  createExpense,
  createOperatingCost,
  createRoomWithTenantSetup,
  createReminder,
  createServiceCharge,
  createStaffUser,
  createTenantService,
  createTenantWithAllocationAndServices,
  createTenant,
  createManagerCreditAdjustment,
  deleteTenant,
  deleteTenantService,
  deleteBuilding,
  deleteElectricityBill,
  deleteFloor,
  deleteExpense,
  deleteRentPayment,
  deleteRoom,
  deleteServiceCharge,
  deleteOperatingCost,
  deleteTenantCharge,
  deleteGovernmentElectricityPayment,
  deleteOwnerSettlement,
  ensureMonthlyRentCycles,
  formatRentMonth,
  getBuildingSnapshot,
  getDashboardOverview,
  getManagerProfitWorkspace,
  getOwnerOverview,
  getUserById,
  getDb,
  getExportRows,
  getManagerNotifications,
  getReceiptReviewHistory,
  listReceiptReviewers,
  getUsers,
  listBuildingsForUser,
  listBuildingRecoveryAccounts,
  markManagerNotificationsRead,
  markReminderComplete,
  recordElectricityBill,
  recordExport,
  recordRentPayment,
  recordTenantChargePayment,
  reviewTenantPaymentReceipt,
  refreshManagerCollectionNotifications,
  resetTenantCredentials,
  resetBuildingAccountCredentials,
  restoreDeletedEntry,
  revokeTenantCredentials,
  archiveTenant,
  triggerRentPaymentReminder,
  transferActiveTenant,
  updateBuilding,
  updateAllocation,
  updateElectricityBill,
  updateExpense,
  updateOperatingCost,
  updateRentPayment,
  updateRoom,
  updateServiceCharge,
  updateTenantService,
  updateTenant,
  updateOwnCredentials,
  updateUserRole,
  confirmOwnerSettlement,
  upsertGovernmentElectricityPayment,
  upsertOwnerSettlement,
  vacateAllocation,
} from "../db";
import { uploadImageDataUrl } from "../imageUpload";
import { assertTenantCanReceiveAllocation, calculateElectricityBill, deriveRentStatus, getDefaultBillingModeForRoomType, getRoomCapacityForType } from "../domain";
import { hasValidExportDateRange } from "../exportFilters";
import { getCsvExportData, getWorkbookExportData, getWorkbookExportPreview, workbookExportDatasets } from "../exportWorkbook";
import { canCreateExpense, hasRolePermission } from "../permissions";
import { adminProcedure, delegateAdminProcedure, protectedProcedure, router } from "../_core/trpc";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates.");
const monthString = z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM billing months.");
const storedImageUrl = z.union([
  z.string().url().max(1000),
  z.string().regex(/^\/manus-storage\/[A-Za-z0-9][A-Za-z0-9._/-]*$/, "Use a valid uploaded image URL.").max(1000),
]);
const optionalStoredImageUrl = storedImageUrl.optional().or(z.literal(""));
const nullableStoredImageUrl = storedImageUrl.nullable().or(z.literal(""));
const optionalNullableStoredImageUrl = storedImageUrl.optional().nullable().or(z.literal(""));
const optionalDateString = dateString.optional();
const operatingCostKind = z.enum(["staff", "supplies", "maintenance"]);
const operatingCostCategory = z.enum(["helper_salary", "cook_salary", "staff_advance", "staff_settlement", "groceries", "utensils", "gas", "cleaning", "water", "repair_electrician", "repair_plumber", "rent_equipment", "other"]);
const liabilityMode = z.enum(["building", "room_shared", "tenant_assigned"]);
const roomType = z.enum(["single", "double", "triple", "four", "individual", "coliving"]);
const roomBillingMode = z.enum(["equal_split", "manager_set", "primary_payer"]);
const operatingCostInput = z.object({ buildingId: z.number().int().positive(), roomId: z.number().int().positive().nullable().optional(), tenantId: z.number().int().positive().nullable().optional(), liabilityMode: liabilityMode.default("building"), kind: operatingCostKind, category: operatingCostCategory, title: z.string().trim().min(2).max(160), payeeName: z.string().trim().max(120).optional(), vendorName: z.string().trim().max(120).optional(), amountPaise: z.number().int().positive(), paidAmountPaise: z.number().int().min(0), workStatus: z.enum(["open", "in_progress", "complete"]).default("open"), costDate: dateString, dueDate: optionalDateString, receiptUrl: optionalStoredImageUrl, notes: z.string().trim().max(800).optional() });
const operatingCostCategories: Record<z.infer<typeof operatingCostKind>, readonly z.infer<typeof operatingCostCategory>[]> = { staff: ["helper_salary", "cook_salary", "staff_advance", "staff_settlement"], supplies: ["groceries", "utensils", "gas", "cleaning", "water", "other"], maintenance: ["repair_electrician", "repair_plumber", "rent_equipment", "other"] };

function assertOperatingCostInput(input: z.infer<typeof operatingCostInput>) {
  if (input.paidAmountPaise > input.amountPaise) throw new TRPCError({ code: "BAD_REQUEST", message: "Paid amount cannot be greater than the recorded cost." });
  if (!operatingCostCategories[input.kind].includes(input.category as never)) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a category that belongs to the selected cost type." });
  if (input.liabilityMode === "room_shared" && !input.roomId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an occupied room for a shared tenant cost." });
  if (input.liabilityMode === "tenant_assigned" && !input.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the tenant responsible for this cost." });
}

async function assertRoomAndTenantBelongToBuilding(roomId: number, tenantId: number, buildingId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });

  const [room, tenant] = await Promise.all([
    db.select().from(rooms).where(and(eq(rooms.id, roomId), eq(rooms.buildingId, buildingId))).limit(1),
    db.select().from(tenants).where(and(eq(tenants.id, tenantId), eq(tenants.buildingId, buildingId))).limit(1),
  ]);

  if (!room[0] || !tenant[0]) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Room and tenant must belong to the selected building." });
  }
}

function resolveRoomSettings(input: { roomType: z.infer<typeof roomType>; billingMode?: z.infer<typeof roomBillingMode>; capacity: number }) {
  const billingMode = input.billingMode ?? getDefaultBillingModeForRoomType(input.roomType);
  if (["single", "double", "triple", "four"].includes(input.roomType) && billingMode !== "equal_split") throw new TRPCError({ code: "BAD_REQUEST", message: "Standard room types use equal shared-bill allocation." });
  if (input.roomType === "coliving" && billingMode !== "primary_payer") throw new TRPCError({ code: "BAD_REQUEST", message: "Co-living rooms require a single primary payer until the Manager explicitly changes the allocation mode." });
  if (input.roomType === "individual" && billingMode === "primary_payer") throw new TRPCError({ code: "BAD_REQUEST", message: "Individual rooms use Manager-set or equal allocation, not a Co-living primary payer." });
  return { billingMode, capacity: getRoomCapacityForType(input.roomType, input.capacity) };
}

export const pgRouter = router({
  recovery: router({
    restore: protectedProcedure.input(z.object({ auditId: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Manager who deleted the record can use immediate undo." });
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      try {
        return { success: true, ...(await restoreDeletedEntry({ ...input, restoredBy: ctx.user.id })) };
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "The deletion could not be safely undone." });
      }
    }),
  }),

  buildings: router({
    list: protectedProcedure.query(({ ctx }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Use the Owner summary for read-only building information." });
      return listBuildingsForUser(ctx.user);
    }),
    create: protectedProcedure
      .input(z.object({ name: z.string().trim().min(2).max(120), address: z.string().trim().min(5), city: z.string().trim().max(80).optional(), landmark: z.string().trim().max(160).optional(), contactPhone: z.string().trim().max(32).optional(), imageUrl: optionalStoredImageUrl, mapUrl: z.string().url().max(1000).optional().or(z.literal("")), ownerName: z.string().trim().min(2).max(120), ownerPhone: z.string().trim().min(7).max(32), ownerPassword: z.string().min(8).max(128).optional(), ownerMonthlyCutPaise: z.number().int().min(0).default(0), electricityRatePaise: z.number().int().min(0).max(100000), rentDueDay: z.number().int().min(1).max(28).default(5) }))
      .mutation(async ({ ctx, input }) => {
        if (!hasRolePermission(ctx.user.role, "manageBuildings")) throw new TRPCError({ code: "FORBIDDEN", message: "Building management access is required." });
        const ownerId = await createOrLinkBuildingOwner({ name: input.ownerName, phone: normalizePhone(input.ownerPhone), passwordHash: input.ownerPassword ? hashPassword(input.ownerPassword) : undefined });
        const { ownerName: _ownerName, ownerPhone: _ownerPhone, ownerPassword: _ownerPassword, ...buildingInput } = input;
        const buildingId = await createBuilding({ ...buildingInput, ownerCutPercent: 0, ownerId });
        await addStaffAssignment({ buildingId, userId: ctx.user.id });
        return { buildingId };
      }),
    update: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), name: z.string().trim().min(2).max(120), address: z.string().trim().min(5), city: z.string().trim().max(80).nullable(), landmark: z.string().trim().max(160).nullable(), contactPhone: z.string().trim().max(32).nullable(), imageUrl: nullableStoredImageUrl, mapUrl: z.string().url().max(1000).nullable().or(z.literal("")), ownerMonthlyCutPaise: z.number().int().min(0).default(0), paymentBankName: z.string().trim().max(120).optional().nullable(), paymentAccountName: z.string().trim().max(120).optional().nullable(), paymentAccountNumber: z.string().trim().max(64).optional().nullable(), paymentIfsc: z.string().trim().max(32).optional().nullable(), paymentUpiId: z.string().trim().max(120).optional().nullable(), paymentQrUrl: optionalNullableStoredImageUrl, electricityRatePaise: z.number().int().min(0).max(100000), rentDueDay: z.number().int().min(1).max(28).default(5) }))
      .mutation(async ({ ctx, input }) => {
        await requireBuildingAccess(ctx.user, input.id, "manageBuildings");
        await updateBuilding({ ...input, ownerCutPercent: 0, imageUrl: input.imageUrl || null, mapUrl: input.mapUrl || null, paymentBankName: input.paymentBankName || null, paymentAccountName: input.paymentAccountName || null, paymentAccountNumber: input.paymentAccountNumber || null, paymentIfsc: input.paymentIfsc || null, paymentUpiId: input.paymentUpiId || null, paymentQrUrl: input.paymentQrUrl || null });
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await requireBuildingAccess(ctx.user, input.id, "manageBuildings");
        try {
          await deleteBuilding(input.id);
        } catch (error) {
          throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Building cannot be deleted." });
        }
        return { success: true };
      }),
  }),

  uploads: router({
    image: protectedProcedure.input(z.object({ dataUrl: z.string().max(7_000_000), purpose: z.enum(["building", "room", "meter", "receipt", "payment_qr"]) })).mutation(async ({ ctx, input }) => {
      const uploaded = await uploadImageDataUrl({ ...input, userId: ctx.user.id });
      return { url: uploaded.url };
    }),
  }),

  account: router({
    updateOwnCredentials: protectedProcedure.input(z.object({ phone: z.string().trim().min(7).max(32), currentPassword: z.string().min(8).max(128), newPassword: z.string().min(8).max(128).optional() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only Owner and Manager accounts can update these credentials here." });
      const account = await getUserById(ctx.user.id);
      if (!account?.passwordHash || !verifyPassword(input.currentPassword, account.passwordHash)) throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect." });
      const phone = normalizePhone(input.phone);
      if (phone.length !== 10) throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a valid 10-digit phone number." });
      try {
        await updateOwnCredentials({ userId: ctx.user.id, phone, passwordHash: input.newPassword ? hashPassword(input.newPassword) : null });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Account credentials could not be updated." });
      }
      return { success: true };
    }),
    recoveryAccounts: protectedProcedure.input(z.object({ buildingId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Manager can access building credential recovery." });
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      return listBuildingRecoveryAccounts(input.buildingId);
    }),
    resetBuildingAccountPassword: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), userId: z.number().int().positive(), password: z.string().min(8).max(128) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Manager can reset a linked account password." });
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      await resetBuildingAccountCredentials({ buildingId: input.buildingId, userId: input.userId, passwordHash: hashPassword(input.password), createdBy: ctx.user.id });
      return { success: true };
    }),
  }),

  dashboard: router({
    get: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), periodMode: z.enum(["monthly", "yearly"]).default("monthly"), periodKey: z.string().regex(/^\d{4}(?:-(0[1-9]|1[0-2]))?$/).optional() }).superRefine((input, context) => {
      if (input.periodKey && ((input.periodMode === "monthly" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.periodKey)) || (input.periodMode === "yearly" && !/^\d{4}$/.test(input.periodKey)))) context.addIssue({ code: "custom", message: "Choose a valid reporting month or year.", path: ["periodKey"] });
    })).query(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "The Owner dashboard is intentionally limited to the approved summary." });
      await requireBuildingAccess(ctx.user, input.buildingId, "read");
      const accessibleBuildings = await listBuildingsForUser(ctx.user);
      return getDashboardOverview(input.buildingId, accessibleBuildings.length, input.periodMode, input.periodKey);
    }),
  }),

  owner: router({
    overview: protectedProcedure.input(z.object({ periodKey: monthString.optional() })).query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the building Owner can view the Owner summary." });
      const accessibleBuildings = await listBuildingsForUser(ctx.user);
      return getOwnerOverview({ buildingIds: accessibleBuildings.map(building => building.id), periodMode: "monthly", periodKey: input.periodKey });
    }),
    confirmSettlement: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), settlementId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the building Owner can confirm a settlement payment." });
      const accessibleBuildings = await listBuildingsForUser(ctx.user);
      if (!accessibleBuildings.some(building => building.id === input.buildingId)) throw new TRPCError({ code: "FORBIDDEN", message: "This building is not in your Owner portfolio." });
      await confirmOwnerSettlement({ id: input.settlementId, buildingId: input.buildingId, ownerId: ctx.user.id });
      return { success: true };
    }),
    addManagerCreditAdjustment: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), billingMonth: monthString, amountPaise: z.number().int().min(-100_000_000).max(100_000_000).refine(value => value !== 0, "Enter a non-zero credit adjustment."), notes: z.string().trim().min(3).max(800) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the building Owner can adjust Manager credit." });
      const accessibleBuildings = await listBuildingsForUser(ctx.user);
      if (!accessibleBuildings.some(building => building.id === input.buildingId)) throw new TRPCError({ code: "FORBIDDEN", message: "This building is not in your Owner portfolio." });
      await createManagerCreditAdjustment({ ...input, createdBy: ctx.user.id });
      return { success: true };
    }),
    remindManager: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), title: z.string().trim().min(3).max(180), dueDate: dateString })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only the building Owner can send a Manager follow-up." });
      const accessibleBuildings = await listBuildingsForUser(ctx.user);
      if (!accessibleBuildings.some(building => building.id === input.buildingId)) throw new TRPCError({ code: "FORBIDDEN", message: "This building is not in your Owner portfolio." });
      await createReminder({ buildingId: input.buildingId, tenantId: null, rentPaymentId: null, title: `Owner follow-up · ${input.title}`, dueDate: input.dueDate, createdBy: ctx.user.id });
      return { success: true };
    }),
  }),

  profit: router({
    get: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), periodKey: monthString.optional() })).query(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Manager can view the operational profit workspace." });
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      const accessibleBuildings = await listBuildingsForUser(ctx.user);
      return getManagerProfitWorkspace({ buildingId: input.buildingId, totalBuildings: accessibleBuildings.length, periodMode: "monthly", periodKey: input.periodKey });
    }),
    saveOwnerSettlement: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), billingMonth: monthString, expectedAmountPaise: z.number().int().positive(), paidAmountPaise: z.number().int().min(0), dueDate: dateString, paidOn: optionalDateString, paymentMethod: z.enum(["cash", "upi", "bank_transfer", "cheque"]).optional(), notes: z.string().trim().max(800).optional(), receiptUrl: optionalStoredImageUrl }).refine(input => input.paidAmountPaise <= input.expectedAmountPaise, { message: "Paid amount cannot exceed the Owner settlement amount.", path: ["paidAmountPaise"] })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Manager can record an Owner settlement." });
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      await upsertOwnerSettlement({ ...input, paidOn: input.paidOn || null, paymentMethod: input.paymentMethod ?? null, notes: input.notes || null, receiptUrl: input.receiptUrl || null, createdBy: ctx.user.id });
      return { success: true };
    }),
    deleteOwnerSettlement: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Manager can remove an incorrect Owner settlement." });
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      return { success: true, ...(await deleteOwnerSettlement({ ...input, createdBy: ctx.user.id })) };
    }),
    saveGovernmentElectricity: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), billingMonth: monthString, expectedAmountPaise: z.number().int().positive(), paidAmountPaise: z.number().int().min(0), dueDate: dateString, paidOn: optionalDateString, paymentMethod: z.enum(["cash", "upi", "bank_transfer", "cheque"]).optional(), notes: z.string().trim().max(800).optional(), receiptUrl: optionalStoredImageUrl }).refine(input => input.paidAmountPaise <= input.expectedAmountPaise, { message: "Paid amount cannot exceed the government electricity bill.", path: ["paidAmountPaise"] })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Manager can record a government electricity payment." });
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      await upsertGovernmentElectricityPayment({ ...input, paidOn: input.paidOn || null, paymentMethod: input.paymentMethod ?? null, notes: input.notes || null, receiptUrl: input.receiptUrl || null, createdBy: ctx.user.id });
      return { success: true };
    }),
    deleteGovernmentElectricity: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Manager can remove an incorrect government electricity entry." });
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      return { success: true, ...(await deleteGovernmentElectricityPayment({ ...input, createdBy: ctx.user.id })) };
    }),
  }),

  operations: router({
    snapshot: protectedProcedure.input(z.object({ buildingId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Operational data is available only in the Manager workspace." });
      await requireBuildingAccess(ctx.user, input.buildingId, "read");
      return getBuildingSnapshot(input.buildingId);
    }),
    addFloor: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), name: z.string().trim().min(1).max(80), level: z.number().int().min(0).max(200) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRooms");
      await addFloor(input);
      return { success: true };
    }),
    addGeneratedFloors: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), floorCount: z.number().int().min(0).max(200) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRooms");
      return addGeneratedFloors(input);
    }),
    deleteFloor: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRooms");
      try {
        await deleteFloor(input);
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Floor cannot be deleted." });
      }
      return { success: true };
    }),
    addRoom: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), floorId: z.number().int().positive().nullable(), number: z.string().trim().min(1).max(32), capacity: z.number().int().min(1).max(12).default(2), roomType, billingMode: roomBillingMode.optional(), airConditioning: z.enum(["ac", "non_ac"]).default("non_ac"), balcony: z.enum(["balcony", "non_balcony"]).default("non_balcony"), imageUrl: optionalStoredImageUrl, defaultRentPaise: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRooms");
      const settings = resolveRoomSettings(input);
      await addRoom({ ...input, ...settings, imageUrl: input.imageUrl || null });
      return { success: true };
    }),
    setupRoomWithTenant: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), floorId: z.number().int().positive().nullable(), number: z.string().trim().min(1).max(32), capacity: z.number().int().min(1).max(12).default(2), roomType, billingMode: roomBillingMode.optional(), airConditioning: z.enum(["ac", "non_ac"]).default("non_ac"), balcony: z.enum(["balcony", "non_balcony"]).default("non_balcony"), imageUrl: optionalStoredImageUrl, defaultRentPaise: z.number().int().min(0).default(0), tenant: z.object({ fullName: z.string().trim().min(2).max(120), phone: z.string().trim().min(7).max(32), password: z.string().min(8).max(128), email: z.string().email().optional().or(z.literal("")), emergencyContactName: z.string().trim().max(120).optional(), emergencyContactPhone: z.string().trim().max(32).optional(), address: z.string().trim().max(800).optional(), identityDocumentUrl: optionalStoredImageUrl }), allocation: z.object({ moveInDate: dateString, bedLabel: z.string().trim().max(32).optional(), isPrimaryPayer: z.enum(["no", "yes"]).optional(), monthlyRentPaise: z.number().int().min(0), depositPaise: z.number().int().min(0) }), services: z.array(z.object({ serviceType: z.enum(["tiffin", "water_bottle", "other"]), monthlyChargePaise: z.number().int().positive(), notes: z.string().trim().max(800).optional() })).max(3) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRooms");
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      try {
        const settings = resolveRoomSettings(input);
        return await createRoomWithTenantSetup({ buildingId: input.buildingId, floorId: input.floorId, number: input.number, ...settings, roomType: input.roomType, airConditioning: input.airConditioning, balcony: input.balcony, imageUrl: input.imageUrl || null, defaultRentPaise: input.defaultRentPaise || input.allocation.monthlyRentPaise, tenant: { ...input.tenant, phone: normalizePhone(input.tenant.phone), email: input.tenant.email || null, emergencyContactName: input.tenant.emergencyContactName || null, emergencyContactPhone: input.tenant.emergencyContactPhone || null, address: input.tenant.address || null, identityDocumentUrl: input.tenant.identityDocumentUrl || null, passwordHash: hashPassword(input.tenant.password) }, allocation: { ...input.allocation, bedLabel: input.allocation.bedLabel || null, isPrimaryPayer: settings.billingMode === "primary_payer" ? "yes" : input.allocation.isPrimaryPayer ?? "no" }, services: input.services.map(service => ({ serviceType: service.serviceType, monthlyChargePaise: service.monthlyChargePaise, notes: service.notes || null, createdBy: ctx.user.id })) });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Room and tenant setup could not be saved." });
      }
    }),
    updateRoom: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive(), floorId: z.number().int().positive().nullable(), number: z.string().trim().min(1).max(32), capacity: z.number().int().min(1).max(12).default(2), roomType, billingMode: roomBillingMode.optional(), airConditioning: z.enum(["ac", "non_ac"]).default("non_ac"), balcony: z.enum(["balcony", "non_balcony"]).default("non_balcony"), imageUrl: optionalStoredImageUrl, defaultRentPaise: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRooms");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const activeAllocations = await db.select({ id: roomAllocations.id, monthlyRentPaise: roomAllocations.monthlyRentPaise }).from(roomAllocations).where(and(eq(roomAllocations.roomId, input.id), eq(roomAllocations.status, "active")));
      const settings = resolveRoomSettings(input);
      const capacity = settings.capacity;
      if (activeAllocations.length > capacity) throw new TRPCError({ code: "CONFLICT", message: "The selected sharing type cannot be lower than the current active tenant count." });
      const derivedRoomRentPaise = activeAllocations.length > 0 ? activeAllocations.reduce((total, allocation) => total + allocation.monthlyRentPaise, 0) : input.defaultRentPaise;
      await updateRoom({ ...input, ...settings, capacity, defaultRentPaise: input.roomType === "individual" ? input.defaultRentPaise : derivedRoomRentPaise, imageUrl: input.imageUrl || null });
      return { success: true };
    }),
    deleteRoom: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRooms");
      try {
        await deleteRoom(input);
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Room cannot be deleted." });
      }
      return { success: true };
    }),
    createTenant: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), fullName: z.string().trim().min(2).max(120), phone: z.string().trim().min(7).max(32), email: z.string().email().optional().or(z.literal("")), emergencyContactName: z.string().trim().max(120).optional(), emergencyContactPhone: z.string().trim().max(32).optional(), address: z.string().trim().max(800).optional(), identityDocumentUrl: optionalStoredImageUrl, password: z.string().min(8).max(128) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      await createTenant({ ...input, phone: normalizePhone(input.phone), email: input.email || null, emergencyContactName: input.emergencyContactName || null, emergencyContactPhone: input.emergencyContactPhone || null, address: input.address || null, identityDocumentUrl: input.identityDocumentUrl || null, passwordHash: hashPassword(input.password) });
      return { success: true };
    }),
    updateTenant: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive(), fullName: z.string().trim().min(2).max(120), phone: z.string().trim().min(7).max(32), email: z.string().email().optional().or(z.literal("")), emergencyContactName: z.string().trim().max(120).optional(), emergencyContactPhone: z.string().trim().max(32).optional(), address: z.string().trim().max(800).optional(), identityDocumentUrl: optionalStoredImageUrl, status: z.enum(["active", "inactive"]) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      try {
        await updateTenant({ ...input, phone: normalizePhone(input.phone), email: input.email || null, emergencyContactName: input.emergencyContactName || null, emergencyContactPhone: input.emergencyContactPhone || null, address: input.address || null, identityDocumentUrl: input.identityDocumentUrl || null });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error && error.message.includes("Tenant not found") ? error.message : "A phone-password account with this mobile number already exists." });
      }
      return { success: true };
    }),
    resetTenantCredentials: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), buildingId: z.number().int().positive(), password: z.string().min(8).max(128) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      try {
        await resetTenantCredentials({ tenantId: input.tenantId, buildingId: input.buildingId, passwordHash: hashPassword(input.password) });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Tenant login could not be reset." });
      }
      return { success: true };
    }),
    revokeTenantCredentials: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      await revokeTenantCredentials(input);
      return { success: true };
    }),
    archiveTenant: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), buildingId: z.number().int().positive(), moveOutDate: dateString })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      await archiveTenant(input);
      return { success: true };
    }),
    deleteTenant: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      try {
        await deleteTenant(input);
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Tenant cannot be deleted." });
      }
      return { success: true };
    }),
    createTenantService: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), tenantId: z.number().int().positive(), serviceType: z.enum(["tiffin", "water_bottle", "other"]), monthlyChargePaise: z.number().int().positive(), notes: z.string().trim().max(800).optional() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const tenant = (await db.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.id, input.tenantId), eq(tenants.buildingId, input.buildingId))).limit(1))[0];
      if (!tenant) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant must belong to the selected building." });
      await createTenantService({ ...input, notes: input.notes || null, createdBy: ctx.user.id });
      return { success: true };
    }),
    updateTenantService: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive(), tenantId: z.number().int().positive(), serviceType: z.enum(["tiffin", "water_bottle", "other"]), monthlyChargePaise: z.number().int().positive(), active: z.enum(["active", "inactive"]), notes: z.string().trim().max(800).optional() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      await updateTenantService({ ...input, notes: input.notes || null });
      return { success: true };
    }),
    deleteTenantService: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive(), tenantId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      await deleteTenantService(input);
      return { success: true };
    }),
    allocateTenant: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), roomId: z.number().int().positive(), tenantId: z.number().int().positive(), moveInDate: dateString, bedLabel: z.string().trim().max(32).optional(), isPrimaryPayer: z.enum(["no", "yes"]).optional(), monthlyRentPaise: z.number().int().min(0), depositPaise: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      await assertRoomAndTenantBelongToBuilding(input.roomId, input.tenantId, input.buildingId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const active = await db.select().from(roomAllocations).where(and(eq(roomAllocations.roomId, input.roomId), eq(roomAllocations.status, "active")));
      const tenantActiveAllocation = await db.select({ id: roomAllocations.id }).from(roomAllocations).where(and(eq(roomAllocations.tenantId, input.tenantId), eq(roomAllocations.status, "active")));
      const room = await db.select().from(rooms).where(eq(rooms.id, input.roomId)).limit(1);
      if (!room[0] || active.length >= room[0].capacity) {
        throw new TRPCError({ code: "CONFLICT", message: "This room has no vacant bed remaining." });
      }
      try {
        assertTenantCanReceiveAllocation(tenantActiveAllocation.length);
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Tenant already allocated." });
      }
      try {
        await createAllocation(input);
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "This allocation could not be saved." });
      }
      return { success: true };
    }),
    allocateTenantWithServices: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), roomId: z.number().int().positive(), tenantId: z.number().int().positive(), moveInDate: dateString, bedLabel: z.string().trim().max(32).optional(), isPrimaryPayer: z.enum(["no", "yes"]).optional(), monthlyRentPaise: z.number().int().min(0), depositPaise: z.number().int().min(0), services: z.array(z.object({ serviceType: z.enum(["tiffin", "water_bottle", "other"]), monthlyChargePaise: z.number().int().positive(), notes: z.string().trim().max(800).optional() })).max(3) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      await assertRoomAndTenantBelongToBuilding(input.roomId, input.tenantId, input.buildingId);
      try {
        const allocationId = await createAllocationWithServices({ ...input, bedLabel: input.bedLabel || undefined, isPrimaryPayer: input.isPrimaryPayer ?? "no", services: input.services.map(service => ({ serviceType: service.serviceType, monthlyChargePaise: service.monthlyChargePaise, notes: service.notes || null, createdBy: ctx.user.id })) });
        return { allocationId };
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Tenant allocation could not be saved." });
      }
    }),
    createTenantForRoom: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), roomId: z.number().int().positive(), tenant: z.object({ fullName: z.string().trim().min(2).max(120), phone: z.string().trim().min(7).max(32), password: z.string().min(8).max(128), email: z.string().email().optional().or(z.literal("")), emergencyContactName: z.string().trim().max(120).optional(), emergencyContactPhone: z.string().trim().max(32).optional(), address: z.string().trim().max(800).optional(), identityDocumentUrl: optionalStoredImageUrl }), allocation: z.object({ moveInDate: dateString, bedLabel: z.string().trim().max(32).optional(), isPrimaryPayer: z.enum(["no", "yes"]).optional(), monthlyRentPaise: z.number().int().min(0), depositPaise: z.number().int().min(0) }), services: z.array(z.object({ serviceType: z.enum(["tiffin", "water_bottle", "other"]), monthlyChargePaise: z.number().int().positive(), notes: z.string().trim().max(800).optional() })).max(3) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      try {
        return await createTenantWithAllocationAndServices({ buildingId: input.buildingId, roomId: input.roomId, tenant: { ...input.tenant, phone: normalizePhone(input.tenant.phone), email: input.tenant.email || null, emergencyContactName: input.tenant.emergencyContactName || null, emergencyContactPhone: input.tenant.emergencyContactPhone || null, address: input.tenant.address || null, identityDocumentUrl: input.tenant.identityDocumentUrl || null, passwordHash: hashPassword(input.tenant.password) }, allocation: { ...input.allocation, bedLabel: input.allocation.bedLabel || null, isPrimaryPayer: input.allocation.isPrimaryPayer ?? "no" }, services: input.services.map(service => ({ serviceType: service.serviceType, monthlyChargePaise: service.monthlyChargePaise, notes: service.notes || null, createdBy: ctx.user.id })) });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Tenant room setup could not be saved." });
      }
    }),
    transferTenant: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), allocationId: z.number().int().positive(), destinationRoomId: z.number().int().positive(), effectiveDate: dateString, bedLabel: z.string().trim().max(32).optional(), monthlyRentPaise: z.number().int().positive(), depositPaise: z.number().int().min(0), applyProration: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      try {
        return await transferActiveTenant({ ...input, bedLabel: input.bedLabel || null, recordedBy: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Tenant transfer could not be saved." });
      }
    }),
    vacateTenant: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), allocationId: z.number().int().positive(), moveOutDate: dateString })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      try {
        await vacateAllocation(input);
      } catch (error) {
        throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "Active allocation could not be found." });
      }
      return { success: true };
    }),
    updateAllocation: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive(), moveInDate: dateString, bedLabel: z.string().trim().max(32).optional(), monthlyRentPaise: z.number().int().positive(), depositPaise: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageTenants");
      await updateAllocation({ ...input, bedLabel: input.bedLabel || null });
      return { success: true };
    }),
  }),

  rent: router({
    upsert: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), allocationId: z.number().int().positive(), tenantId: z.number().int().positive(), rentMonth: monthString, dueDate: dateString, expectedAmountPaise: z.number().int().positive(), paidAmountPaise: z.number().int().min(0), paidOn: optionalDateString, paymentMethod: z.enum(["cash", "upi", "bank_transfer"]).optional(), notes: z.string().trim().max(800).optional(), receiptUrl: optionalStoredImageUrl })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRent");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable." });
      const allocation = (await db.select().from(roomAllocations).where(and(eq(roomAllocations.id, input.allocationId), eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.tenantId, input.tenantId), eq(roomAllocations.status, "active"))).limit(1))[0];
      if (!allocation) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an active allocation from the selected building." });
      const expectedAmountPaise = allocation.monthlyRentPaise;
      const status = deriveRentStatus(expectedAmountPaise, input.paidAmountPaise);
      await recordRentPayment({ ...input, expectedAmountPaise, status, paidOn: status === "pending" ? null : input.paidOn ?? new Date().toISOString().slice(0, 10), paymentMethod: status === "pending" ? null : input.paymentMethod ?? null, notes: input.notes || null, receiptUrl: input.receiptUrl || null, recordedBy: ctx.user.id });
      return { status, ownerAlertSent: false };
    }),
    generateCycle: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), rentMonth: monthString.optional() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRent");
      return ensureMonthlyRentCycles({ buildingId: input.buildingId, rentMonth: input.rentMonth ?? formatRentMonth(new Date()), createdBy: ctx.user.id });
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive(), expectedUpdatedAt: z.date(), dueDate: dateString, expectedAmountPaise: z.number().int().positive(), paidAmountPaise: z.number().int().min(0), paidOn: optionalDateString, paymentMethod: z.enum(["cash", "upi", "bank_transfer"]).optional(), notes: z.string().trim().max(800).optional(), receiptUrl: optionalStoredImageUrl })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRent");
      const status = deriveRentStatus(input.expectedAmountPaise, input.paidAmountPaise);
      try {
        await updateRentPayment({ ...input, status, paidOn: status === "pending" ? null : input.paidOn ?? new Date().toISOString().slice(0, 10), paymentMethod: status === "pending" ? null : input.paymentMethod ?? null, notes: input.notes || null, receiptUrl: input.receiptUrl || null, recordedBy: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Rent record could not be updated." });
      }
      return { status };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Manager can remove an incorrect rent record." });
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRent");
      return { success: true, ...(await deleteRentPayment({ ...input, createdBy: ctx.user.id })) };
    }),
    triggerReminder: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRent");
      try {
        return await triggerRentPaymentReminder({ ...input, createdBy: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to create a rent reminder." });
      }
    }),
  }),

  notifications: router({
    list: protectedProcedure.input(z.object({ buildingId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRent");
      return getManagerNotifications(input.buildingId);
    }),
    markRead: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), notificationIds: z.array(z.number().int().positive()).optional() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRent");
      await markManagerNotificationsRead(input);
      return { success: true };
    }),
    refresh: protectedProcedure.input(z.object({ buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageRent");
      return refreshManagerCollectionNotifications({ buildingId: input.buildingId, today: new Date().toISOString().slice(0, 10) });
    }),
  }),

  electricity: router({
    upsert: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), roomId: z.number().int().positive(), billingMonth: monthString, previousReading: z.number().int().min(0), currentReading: z.number().int().min(0), dueDate: optionalDateString, notes: z.string().trim().max(800).optional(), meterImageUrl: optionalStoredImageUrl })).mutation(async ({ ctx, input }) => {
      const building = await requireBuildingAccess(ctx.user, input.buildingId, "manageElectricity");
      const calculation = calculateElectricityBill(input.previousReading, input.currentReading, building.electricityRatePaise);
      await recordElectricityBill({ ...input, ...calculation, paidAmountPaise: 0, status: "pending", paidOn: null, paymentMethod: null, ratePerUnitPaise: building.electricityRatePaise, dueDate: input.dueDate ?? null, notes: input.notes || null, meterImageUrl: input.meterImageUrl || null, receiptUrl: null, recordedBy: ctx.user.id });
      return calculation;
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive(), expectedUpdatedAt: z.date(), previousReading: z.number().int().min(0), currentReading: z.number().int().min(0), paidAmountPaise: z.number().int().min(0), paidOn: optionalDateString, paymentMethod: z.enum(["cash", "upi", "bank_transfer"]).optional(), meterImageUrl: optionalStoredImageUrl, receiptUrl: optionalStoredImageUrl, dueDate: optionalDateString, notes: z.string().trim().max(800).optional() })).mutation(async ({ ctx, input }) => {
      const building = await requireBuildingAccess(ctx.user, input.buildingId, "manageElectricity");
      const calculation = calculateElectricityBill(input.previousReading, input.currentReading, building.electricityRatePaise);
      const status = deriveRentStatus(calculation.billAmountPaise, input.paidAmountPaise);
      try {
        await updateElectricityBill({ ...input, ...calculation, status, paidOn: status === "pending" ? null : input.paidOn ?? new Date().toISOString().slice(0, 10), paymentMethod: status === "pending" ? null : input.paymentMethod ?? null, ratePerUnitPaise: building.electricityRatePaise, dueDate: input.dueDate ?? null, notes: input.notes || null, meterImageUrl: input.meterImageUrl || null, receiptUrl: input.receiptUrl || null, recordedBy: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Electricity record could not be updated." });
      }
      return { ...calculation, status, reminderResolved: status === "paid" };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Manager can remove an incorrect electricity bill." });
      await requireBuildingAccess(ctx.user, input.buildingId, "manageElectricity");
      return { success: true, ...(await deleteElectricityBill({ ...input, createdBy: ctx.user.id })) };
    }),
    createOverdueReminder: protectedProcedure.input(z.object({ billId: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageElectricity");
      try {
        return await createElectricityOverdueReminder({ ...input, createdBy: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to create electricity reminder." });
      }
    }),
  }),

  tenantCharges: router({
    recordPayment: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive(), expectedUpdatedAt: z.date(), paidAmountPaise: z.number().int().min(0), paidOn: optionalDateString, paymentMethod: z.enum(["cash", "upi", "bank_transfer"]).optional(), receiptUrl: optionalStoredImageUrl })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      try {
        return await recordTenantChargePayment({ ...input, paidOn: input.paidOn ?? null, paymentMethod: input.paymentMethod ?? null, receiptUrl: input.receiptUrl || null, recordedBy: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Tenant charge could not be updated." });
      }
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Manager can remove an uncollected tenant charge." });
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      return { success: true, ...(await deleteTenantCharge({ ...input, createdBy: ctx.user.id })) };
    }),
  }),

  receiptReviews: router({
    reviewers: protectedProcedure.input(z.object({ buildingId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "read");
      if (ctx.user.role !== "admin" && ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Owner or Manager can view receipt reviewers." });
      return listReceiptReviewers(input.buildingId);
    }),
    history: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), tenantId: z.number().int().positive().optional(), reviewerId: z.number().int().positive().optional(), reviewedFrom: optionalDateString, reviewedTo: optionalDateString, paymentMethod: z.enum(["cash", "upi", "bank_transfer"]).optional(), amountMinPaise: z.number().int().min(0).optional(), amountMaxPaise: z.number().int().min(0).optional() }).refine(input => !input.reviewedFrom || !input.reviewedTo || input.reviewedFrom <= input.reviewedTo, { message: "Review start date must be on or before the end date.", path: ["reviewedTo"] }).refine(input => input.amountMinPaise === undefined || input.amountMaxPaise === undefined || input.amountMinPaise <= input.amountMaxPaise, { message: "Minimum amount must not exceed maximum amount.", path: ["amountMaxPaise"] })).query(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "read");
      if (ctx.user.role !== "admin" && ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Owner or Manager can view receipt review history." });
      return getReceiptReviewHistory({ buildingId: input.buildingId, tenantId: input.tenantId, reviewerId: input.reviewerId, reviewedFrom: input.reviewedFrom ? new Date(`${input.reviewedFrom}T00:00:00.000Z`) : undefined, reviewedTo: input.reviewedTo ? new Date(`${input.reviewedTo}T23:59:59.999Z`) : undefined, paymentMethod: input.paymentMethod, amountMinPaise: input.amountMinPaise, amountMaxPaise: input.amountMaxPaise });
    }),
    decide: protectedProcedure.input(z.object({ type: z.enum(["rent", "electricity", "tenant_charge"]), billId: z.number().int().positive(), buildingId: z.number().int().positive(), expectedUpdatedAt: z.date(), status: z.enum(["approved", "rejected"]), reviewNote: z.string().trim().max(800).optional() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      if (ctx.user.role !== "admin" && ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Owner or Manager can review tenant payment proof." });
      if (input.status === "rejected" && !input.reviewNote?.trim()) throw new TRPCError({ code: "BAD_REQUEST", message: "A rejection note is required before rejecting tenant payment proof." });
      try {
        return await reviewTenantPaymentReceipt({ ...input, reviewNote: input.reviewNote || null, reviewedBy: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Payment proof could not be reviewed." });
      }
    }),
  }),

  expenses: router({
    create: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), roomId: z.number().int().positive().nullable().optional(), tenantId: z.number().int().positive().nullable().optional(), liabilityMode: liabilityMode.default("building"), category: z.enum(["maintenance", "groceries", "salaries", "utilities", "rent", "water", "labor", "tiffin", "other"]), amountPaise: z.number().int().positive(), expenseDate: dateString, notes: z.string().trim().max(800).optional(), receiptUrl: optionalStoredImageUrl })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      if (!canCreateExpense(ctx.user.role, input.category)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cooks can record only groceries or tiffin expenses." });
      }
      if (input.liabilityMode === "room_shared" && !input.roomId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an occupied room for a shared tenant cost." });
      if (input.liabilityMode === "tenant_assigned" && !input.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the tenant responsible for this cost." });
      await createExpense({ ...input, roomId: input.roomId ?? null, tenantId: input.tenantId ?? null, notes: input.notes || null, receiptUrl: input.receiptUrl || null, createdBy: ctx.user.id });
      return { success: true };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive(), roomId: z.number().int().positive().nullable().optional(), tenantId: z.number().int().positive().nullable().optional(), liabilityMode: liabilityMode.default("building"), category: z.enum(["maintenance", "groceries", "salaries", "utilities", "rent", "water", "labor", "tiffin", "other"]), amountPaise: z.number().int().positive(), expenseDate: dateString, notes: z.string().trim().max(800).optional(), receiptUrl: optionalStoredImageUrl, expectedUpdatedAt: z.date() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      if (!canCreateExpense(ctx.user.role, input.category)) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot update this expense category." });
      if (input.liabilityMode === "room_shared" && !input.roomId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an occupied room for a shared tenant cost." });
      if (input.liabilityMode === "tenant_assigned" && !input.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the tenant responsible for this cost." });
      await updateExpense({ ...input, roomId: input.roomId ?? null, tenantId: input.tenantId ?? null, notes: input.notes || null, receiptUrl: input.receiptUrl || null, createdBy: ctx.user.id });
      return { success: true };
    }),
    delete: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      return { success: true, ...(await deleteExpense({ ...input, createdBy: ctx.user.id })) };
    }),
    operatingCostCreate: protectedProcedure.input(operatingCostInput).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      if (ctx.user.role !== "admin" && ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Owner or Manager can record staff, supply, and maintenance costs." });
      assertOperatingCostInput(input);
      await createOperatingCost({ ...input, roomId: input.roomId ?? null, tenantId: input.tenantId ?? null, payeeName: input.payeeName || null, vendorName: input.vendorName || null, dueDate: input.dueDate || null, receiptUrl: input.receiptUrl || null, notes: input.notes || null, createdBy: ctx.user.id });
      return { success: true };
    }),
    operatingCostUpdate: protectedProcedure.input(operatingCostInput.extend({ id: z.number().int().positive(), expectedUpdatedAt: z.date() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      if (ctx.user.role !== "admin" && ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Owner or Manager can update staff, supply, and maintenance costs." });
      assertOperatingCostInput(input);
      try {
        await updateOperatingCost({ ...input, roomId: input.roomId ?? null, tenantId: input.tenantId ?? null, payeeName: input.payeeName || null, vendorName: input.vendorName || null, dueDate: input.dueDate || null, receiptUrl: input.receiptUrl || null, notes: input.notes || null, createdBy: ctx.user.id });
      } catch (error) {
        throw new TRPCError({ code: "CONFLICT", message: error instanceof Error ? error.message : "Operating cost could not be updated." });
      }
      return { success: true };
    }),
    operatingCostDelete: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      if (ctx.user.role !== "admin" && ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only the Owner or Manager can remove operating costs." });
      return { success: true, ...(await deleteOperatingCost({ ...input, createdBy: ctx.user.id })) };
    }),
    serviceChargeCreate: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), name: z.string().trim().min(2).max(120), amountPaise: z.number().int().positive(), billingCycle: z.enum(["monthly", "one_time"]), dueDay: z.number().int().min(1).max(28), notes: z.string().trim().max(800).optional() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      if (ctx.user.role === "cook") throw new TRPCError({ code: "FORBIDDEN", message: "Cooks cannot configure recurring building charges." });
      await createServiceCharge({ ...input, notes: input.notes || null, createdBy: ctx.user.id });
      return { success: true };
    }),
    serviceChargeUpdate: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive(), name: z.string().trim().min(2).max(120), amountPaise: z.number().int().positive(), billingCycle: z.enum(["monthly", "one_time"]), dueDay: z.number().int().min(1).max(28), active: z.enum(["active", "inactive"]), notes: z.string().trim().max(800).optional() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      if (ctx.user.role === "cook") throw new TRPCError({ code: "FORBIDDEN", message: "Cooks cannot configure recurring building charges." });
      await updateServiceCharge({ ...input, notes: input.notes || null });
      return { success: true };
    }),
    serviceChargeDelete: protectedProcedure.input(z.object({ id: z.number().int().positive(), buildingId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageExpenses");
      if (ctx.user.role === "cook") throw new TRPCError({ code: "FORBIDDEN", message: "Cooks cannot configure recurring building charges." });
      await deleteServiceCharge(input);
      return { success: true };
    }),
  }),

  reminders: router({
    create: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), tenantId: z.number().int().positive().nullable(), rentPaymentId: z.number().int().positive().nullable(), title: z.string().trim().min(3).max(180), dueDate: dateString })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageReminders");
      await createReminder({ ...input, createdBy: ctx.user.id });
      return { success: true };
    }),
    complete: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), reminderId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "manageReminders");
      await markReminderComplete(input.reminderId, input.buildingId);
      return { success: true };
    }),
  }),

  exports: router({
    prepare: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), exportType: z.enum(["tenants", "rent", "electricity", "expenses"]), dateFrom: optionalDateString, dateTo: optionalDateString })).mutation(async ({ ctx, input }) => {
      await requireBuildingAccess(ctx.user, input.buildingId, "export");
      if (!hasValidExportDateRange(input)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The start date must be before the end date." });
      }
      const rows = await getExportRows(input);
      await recordExport({ ...input, requestedBy: ctx.user.id, dateFrom: input.dateFrom ?? null, dateTo: input.dateTo ?? null });
      return rows;
    }),
    previewWorkbook: protectedProcedure.input(z.object({
      buildingId: z.number().int().positive(),
      mode: z.enum(["selected", "complete"]),
      datasets: z.array(z.enum(workbookExportDatasets)).max(workbookExportDatasets.length).default([]),
      dateFrom: optionalDateString,
      dateTo: optionalDateString,
      paymentStatus: z.enum(["all", "paid", "pending", "partial"]).default("all"),
      outstandingOnly: z.boolean().default(false),
    })).query(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only a building Manager can preview operational workbook fields." });
      await requireBuildingAccess(ctx.user, input.buildingId, "export");
      if (input.mode === "selected" && input.datasets.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one data section to preview." });
      if (!hasValidExportDateRange(input)) throw new TRPCError({ code: "BAD_REQUEST", message: "The start date must be before the end date." });
      return getWorkbookExportPreview(input);
    }),
    csv: protectedProcedure.input(z.object({ buildingId: z.number().int().positive(), dataset: z.enum(["rooms", "tenants"]), dateFrom: optionalDateString, dateTo: optionalDateString })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only a building Manager can export room or tenant CSV data." });
      await requireBuildingAccess(ctx.user, input.buildingId, "export");
      if (!hasValidExportDateRange(input)) throw new TRPCError({ code: "BAD_REQUEST", message: "The start date must be before the end date." });
      const csv = await getCsvExportData(input);
      await recordExport({ buildingId: input.buildingId, requestedBy: ctx.user.id, exportType: "selected", dateFrom: input.dateFrom ?? null, dateTo: input.dateTo ?? null });
      return csv;
    }),
    prepareWorkbook: protectedProcedure.input(z.object({
      buildingId: z.number().int().positive(),
      mode: z.enum(["selected", "complete"]),
      datasets: z.array(z.enum(workbookExportDatasets)).max(workbookExportDatasets.length).default([]),
      dateFrom: optionalDateString,
      dateTo: optionalDateString,
      paymentStatus: z.enum(["all", "paid", "pending", "partial"]).default("all"),
      outstandingOnly: z.boolean().default(false),
      fieldSelections: z.record(z.string(), z.array(z.string().trim().min(1).max(120)).max(80)).optional(),
    })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "manager") throw new TRPCError({ code: "FORBIDDEN", message: "Only a building Manager can export operational workbooks." });
      await requireBuildingAccess(ctx.user, input.buildingId, "export");
      if (input.mode === "selected" && input.datasets.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose at least one data section to export." });
      if (!hasValidExportDateRange(input)) throw new TRPCError({ code: "BAD_REQUEST", message: "The start date must be before the end date." });
      const selectedFields = input.fieldSelections ?? {};
      if (input.mode === "selected" && input.datasets.some(dataset => dataset in selectedFields && selectedFields[dataset].length === 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "Keep at least one field visible for every selected data section." });
      const workbook = await getWorkbookExportData(input);
      await recordExport({ buildingId: input.buildingId, requestedBy: ctx.user.id, exportType: input.mode, dateFrom: input.dateFrom ?? null, dateTo: input.dateTo ?? null });
      return workbook;
    }),
  }),

});
