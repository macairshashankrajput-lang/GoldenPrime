import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import { drizzle as drizzlePostgres, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as postgresSchema from "../drizzle-pg/schema";
import {
  buildings,
  changeAuditLogs,
  electricityBills,
  expenses,
  exportHistory,
  floors,
  governmentElectricityPayments,
  managerCreditAdjustments,
  managerNotifications,
  ownerSettlements,
  operatingCosts,
  reminders,
  rentPayments,
  roomAllocations,
  rooms,
  serviceCharges,
  staffAssignments,
  tenantCharges,
  tenantTransfers,
  tenants,
  tenantServices,
  users,
  type InsertUser,
  type User,
} from "../drizzle-pg/schema";
import { calculateBuildingFinancials, calculateManagerOperatingResult, calculateRoomRentTotal, calculateTransferProration, deriveTenantChargeStatus, getDashboardPeriod, getRoomOccupancy, splitPaiseEvenly, type RoomBillingMode, type RoomType } from "./domain";
import { exportMonthBounds } from "./exportFilters";
import type { AppRole } from "./permissions";
import { ENV } from "./_core/env";

type DatabaseConnection = NodePgDatabase<typeof postgresSchema>;

let cachedDb: DatabaseConnection | null = null;
let cachedPostgresPool: Pool | null = null;

export async function getDb(): Promise<DatabaseConnection | null> {
  if (cachedDb) return cachedDb;

  // Supabase remains the database provider, while Vercel's managed Postgres
  // integration exposes the same pooled connection under POSTGRES_URL.
  // Prefer the portable Supabase setting and fall back to Vercel's names so
  // production mutations do not fail with a misleading unavailable error.
  const connectionString = process.env.SUPABASE_DATABASE_URL
    ?? process.env.POSTGRES_URL
    ?? process.env.POSTGRES_PRISMA_URL
    ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) return null;
  const configuredMax = Number(process.env.SUPABASE_POOL_MAX ?? 8);
  const max = Number.isInteger(configuredMax) && configuredMax >= 2 && configuredMax <= 12 ? configuredMax : 8;
  cachedPostgresPool = new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
    ssl: { rejectUnauthorized: false },
  });
  cachedDb = drizzlePostgres(cachedPostgresPool, { schema: postgresSchema });

  return cachedDb;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database connection is unavailable.");
  return db;
}

export function formatRentMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function getMonthEnd(rentMonth: string) {
  const [year, month] = rentMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function getRentDueDate(rentMonth: string, dueDay: number) {
  const [year, month] = rentMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${rentMonth}-${String(Math.min(Math.max(dueDay, 1), lastDay)).padStart(2, "0")}`;
}

export function buildRentPaymentReminder(input: {
  id: number;
  buildingId: number;
  tenantId: number;
  rentMonth: string;
  dueDate: string;
  createdBy: number | null;
}) {
  return {
    buildingId: input.buildingId,
    tenantId: input.tenantId,
    rentPaymentId: input.id,
    title: `Rent due · ${input.rentMonth}`,
    dueDate: input.dueDate,
    status: "active" as const,
    notifiedAt: null,
    createdBy: input.createdBy,
  };
}

async function syncRentPaymentReminder(input: {
  id: number;
  buildingId: number;
  tenantId: number;
  rentMonth: string;
  dueDate: string;
  status: "paid" | "pending" | "partial";
  createdBy: number | null;
}) {
  const db = await requireDb();
  const existing = await db.select({ id: reminders.id, status: reminders.status })
    .from(reminders)
    .where(eq(reminders.rentPaymentId, input.id))
    .limit(1);

  if (input.status === "paid") {
    if (existing[0]?.status === "active") {
      await db.update(reminders).set({ status: "complete", deliveryRequestedAt: null, deliveryRequestedBy: null }).where(eq(reminders.id, existing[0].id));
    }
    return;
  }

  const reminder = buildRentPaymentReminder(input);

  if (existing[0]) {
    await db.update(reminders).set(reminder).where(eq(reminders.id, existing[0].id));
  } else {
    await db.insert(reminders).values(reminder).onConflictDoUpdate({ target: reminders.rentPaymentId, set: reminder });
  }
}

type ManagerNotificationInput = {
  buildingId: number;
  kind: "rent_cycle" | "rent_upcoming" | "rent_overdue" | "electricity_upcoming" | "electricity_overdue";
  referenceKey: string;
  title: string;
  body: string;
  dueDate: string | null;
};

export async function upsertManagerNotification(input: ManagerNotificationInput) {
  const db = await requireDb();
  await db.insert(managerNotifications).values(input).onConflictDoUpdate({ target: managerNotifications.referenceKey, set: { title: input.title, body: input.body, dueDate: input.dueDate } });
}

export async function ensureMonthlyRentCycles(input: { rentMonth: string; buildingId?: number; roomId?: number; allocationId?: number; createdBy?: number | null }) {
  const db = await requireDb();
  const activeAllocations = await db.select({ allocationId: roomAllocations.id, buildingId: roomAllocations.buildingId, tenantId: roomAllocations.tenantId, monthlyRentPaise: roomAllocations.monthlyRentPaise, moveInDate: roomAllocations.moveInDate, tenantName: tenants.fullName, rentDueDay: buildings.rentDueDay, billingMode: rooms.billingMode, isPrimaryPayer: roomAllocations.isPrimaryPayer })
    .from(roomAllocations).innerJoin(buildings, eq(buildings.id, roomAllocations.buildingId)).innerJoin(tenants, eq(tenants.id, roomAllocations.tenantId)).innerJoin(rooms, eq(rooms.id, roomAllocations.roomId))
    .where(and(eq(roomAllocations.status, "active"), input.buildingId ? eq(roomAllocations.buildingId, input.buildingId) : undefined, input.roomId ? eq(roomAllocations.roomId, input.roomId) : undefined, input.allocationId ? eq(roomAllocations.id, input.allocationId) : undefined));
  let created = 0;
  for (const allocation of activeAllocations) {
    const isRentLiable = allocation.billingMode !== "primary_payer" || allocation.isPrimaryPayer === "yes";
    if (allocation.moveInDate.slice(0, 7) > input.rentMonth || allocation.monthlyRentPaise <= 0 || !isRentLiable) continue;
    const dueDate = getRentDueDate(input.rentMonth, allocation.rentDueDay);
    const existingTenantMonth = await db.select({ id: rentPayments.id, allocationId: rentPayments.allocationId }).from(rentPayments).where(and(eq(rentPayments.buildingId, allocation.buildingId), eq(rentPayments.tenantId, allocation.tenantId), eq(rentPayments.rentMonth, input.rentMonth)));
    const existing = existingTenantMonth.filter(payment => payment.allocationId === allocation.allocationId);
    if (existing.length === 0 && existingTenantMonth.length > 0) continue;
    await db.insert(rentPayments).values({ buildingId: allocation.buildingId, allocationId: allocation.allocationId, tenantId: allocation.tenantId, rentMonth: input.rentMonth, dueDate, expectedAmountPaise: allocation.monthlyRentPaise, paidAmountPaise: 0, status: "pending", paidOn: null, notes: "Auto-generated monthly rent cycle", receiptUrl: null, recordedBy: input.createdBy ?? null }).onConflictDoUpdate({ target: [rentPayments.allocationId, rentPayments.rentMonth], set: { rentMonth: input.rentMonth } });
    const payment = (await db.select({ id: rentPayments.id, status: rentPayments.status }).from(rentPayments).where(and(eq(rentPayments.allocationId, allocation.allocationId), eq(rentPayments.rentMonth, input.rentMonth))).limit(1))[0];
    if (!payment) throw new Error("Automatic rent cycle could not be created.");
    await syncRentPaymentReminder({ id: payment.id, buildingId: allocation.buildingId, tenantId: allocation.tenantId, rentMonth: input.rentMonth, dueDate, status: payment.status, createdBy: input.createdBy ?? null });
    if (!existing[0]) {
      created += 1;
      await upsertManagerNotification({ buildingId: allocation.buildingId, kind: "rent_cycle", referenceKey: `rent-cycle-${payment.id}`, title: `Monthly rent created · ${allocation.tenantName}`, body: `₹${(allocation.monthlyRentPaise / 100).toLocaleString("en-IN")} is due on ${dueDate} for ${input.rentMonth}.`, dueDate });
    }
  }
  await ensureMonthlyTenantServiceCharges(input);
  return { created, rentMonth: input.rentMonth };
}

export async function refreshManagerCollectionNotifications(input: { today: string; upcomingDays?: number; buildingId?: number }) {
  const db = await requireDb();
  const cutoff = new Date(`${input.today}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() + (input.upcomingDays ?? 3));
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const [rents, electricity] = await Promise.all([
    db.select({ id: rentPayments.id, buildingId: rentPayments.buildingId, tenantName: tenants.fullName, expectedAmountPaise: rentPayments.expectedAmountPaise, paidAmountPaise: rentPayments.paidAmountPaise, dueDate: rentPayments.dueDate }).from(rentPayments).innerJoin(tenants, eq(tenants.id, rentPayments.tenantId)).where(and(ne(rentPayments.status, "paid"), input.buildingId ? eq(rentPayments.buildingId, input.buildingId) : undefined)),
    db.select({ id: electricityBills.id, buildingId: electricityBills.buildingId, roomNumber: rooms.number, billAmountPaise: electricityBills.billAmountPaise, paidAmountPaise: electricityBills.paidAmountPaise, dueDate: electricityBills.dueDate }).from(electricityBills).innerJoin(rooms, eq(rooms.id, electricityBills.roomId)).where(and(ne(electricityBills.status, "paid"), input.buildingId ? eq(electricityBills.buildingId, input.buildingId) : undefined)),
  ]);
  let refreshed = 0;
  for (const rent of rents) {
    const pendingPaise = Math.max(rent.expectedAmountPaise - rent.paidAmountPaise, 0);
    if (rent.dueDate < input.today) { await upsertManagerNotification({ buildingId: rent.buildingId, kind: "rent_overdue", referenceKey: `rent-overdue-${rent.id}`, title: `Rent overdue · ${rent.tenantName}`, body: `₹${(pendingPaise / 100).toLocaleString("en-IN")} remains unpaid since ${rent.dueDate}.`, dueDate: rent.dueDate }); refreshed += 1; }
    else if (rent.dueDate <= cutoffDate) { await upsertManagerNotification({ buildingId: rent.buildingId, kind: "rent_upcoming", referenceKey: `rent-upcoming-${rent.id}`, title: `Rent due soon · ${rent.tenantName}`, body: `₹${(pendingPaise / 100).toLocaleString("en-IN")} is due on ${rent.dueDate}.`, dueDate: rent.dueDate }); refreshed += 1; }
  }
  for (const bill of electricity) {
    if (!bill.dueDate) continue;
    const pendingPaise = Math.max(bill.billAmountPaise - bill.paidAmountPaise, 0);
    if (bill.dueDate < input.today) { await upsertManagerNotification({ buildingId: bill.buildingId, kind: "electricity_overdue", referenceKey: `electricity-overdue-${bill.id}`, title: `Electricity overdue · Room ${bill.roomNumber}`, body: `₹${(pendingPaise / 100).toLocaleString("en-IN")} remains unpaid since ${bill.dueDate}.`, dueDate: bill.dueDate }); refreshed += 1; }
    else if (bill.dueDate <= cutoffDate) { await upsertManagerNotification({ buildingId: bill.buildingId, kind: "electricity_upcoming", referenceKey: `electricity-upcoming-${bill.id}`, title: `Electricity due soon · Room ${bill.roomNumber}`, body: `₹${(pendingPaise / 100).toLocaleString("en-IN")} is due on ${bill.dueDate}.`, dueDate: bill.dueDate }); refreshed += 1; }
  }
  return { refreshed, cutoffDate };
}

export async function getManagerNotifications(buildingId: number) {
  const db = await requireDb();
  return db.select().from(managerNotifications).where(eq(managerNotifications.buildingId, buildingId)).orderBy(desc(managerNotifications.createdAt)).limit(40);
}

export async function markManagerNotificationsRead(input: { buildingId: number; notificationIds?: number[] }) {
  const db = await requireDb();
  const condition = input.notificationIds && input.notificationIds.length > 0
    ? and(eq(managerNotifications.buildingId, input.buildingId), inArray(managerNotifications.id, input.notificationIds))
    : and(eq(managerNotifications.buildingId, input.buildingId), eq(managerNotifications.status, "unread"));
  await db.update(managerNotifications).set({ status: "read", readAt: new Date() }).where(condition);
}

async function resolveManagerCollectionNotifications(buildingId: number, referenceKeys: string[]) {
  if (referenceKeys.length === 0) return;
  const db = await requireDb();
  await db.update(managerNotifications).set({ status: "read", readAt: new Date() }).where(and(eq(managerNotifications.buildingId, buildingId), inArray(managerNotifications.referenceKey, referenceKeys)));
}

type TenantChargeSourceType = "electricity" | "expense" | "operating_cost" | "tenant_service";
type LiabilityMode = "building" | "room_shared" | "tenant_assigned";

async function syncTenantCharges(input: {
  buildingId: number;
  roomId: number | null;
  tenantId: number | null;
  liabilityMode: LiabilityMode;
  sourceType: TenantChargeSourceType;
  sourceId: number;
  billingMonth: string | null;
  title: string;
  amountPaise: number;
  dueDate: string | null;
  notes: string | null;
  createdBy: number | null;
  recipientTenantIds?: number[];
}) {
  const db = await requireDb();
  const sourceCondition = and(
    eq(tenantCharges.sourceType, input.sourceType),
    eq(tenantCharges.sourceId, input.sourceId),
    input.billingMonth ? eq(tenantCharges.billingMonth, input.billingMonth) : isNull(tenantCharges.billingMonth),
  );
  const existing = await db.select().from(tenantCharges).where(sourceCondition);
  if (input.liabilityMode === "building") {
    if (existing.some(charge => charge.paidAmountPaise > 0)) throw new Error("A collected tenant charge cannot be converted to a building-only cost.");
    if (existing.length > 0) await db.delete(tenantCharges).where(sourceCondition);
    return [];
  }

  let recipientIds = input.recipientTenantIds ?? [];
  if (input.liabilityMode === "tenant_assigned") {
    if (!input.tenantId) throw new Error("Choose a tenant for a tenant-assigned cost.");
    const tenant = (await db.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.id, input.tenantId), eq(tenants.buildingId, input.buildingId))).limit(1))[0];
    if (!tenant) throw new Error("Selected tenant is not part of this building.");
    recipientIds = [tenant.id];
  }
  if (input.liabilityMode === "room_shared" && recipientIds.length === 0) {
    if (!input.roomId) throw new Error("Choose a room to share this cost.");
    recipientIds = (await db.select({ tenantId: roomAllocations.tenantId }).from(roomAllocations).where(and(eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.roomId, input.roomId), eq(roomAllocations.status, "active")))).map(allocation => allocation.tenantId);
  }
  recipientIds = Array.from(new Set(recipientIds));
  if (recipientIds.length === 0) throw new Error("Assign the cost to a tenant or a room with active occupants.");
  if (input.amountPaise <= 0) {
    if (existing.some(charge => charge.paidAmountPaise > 0)) throw new Error("A collected tenant charge cannot be reset to zero.");
    if (existing.length > 0) await db.delete(tenantCharges).where(sourceCondition);
    return [];
  }
  const shares = input.liabilityMode === "tenant_assigned" ? [input.amountPaise] : splitPaiseEvenly(input.amountPaise, recipientIds.length);
  const existingByTenant = new Map(existing.map(charge => [charge.tenantId, charge]));
  if (existing.some(charge => charge.paidAmountPaise > 0 && (existingByTenant.get(charge.tenantId)?.expectedAmountPaise !== shares[recipientIds.indexOf(charge.tenantId)] || !recipientIds.includes(charge.tenantId)))) {
    throw new Error("This cost already has a tenant payment. Do not change its assignment or total; record a separate adjustment instead.");
  }
  if (existing.length > 0) await db.delete(tenantCharges).where(sourceCondition);
  await db.insert(tenantCharges).values(recipientIds.map((tenantId, index) => ({
    buildingId: input.buildingId,
    tenantId,
    roomId: input.roomId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    billingMonth: input.billingMonth,
    title: input.title,
    expectedAmountPaise: shares[index],
    paidAmountPaise: 0,
    status: "pending" as const,
    dueDate: input.dueDate,
    paidOn: null,
    notes: input.notes,
    receiptUrl: null,
    createdBy: input.createdBy,
  })));
  return recipientIds;
}

function formatTenantServiceTitle(serviceType: "tiffin" | "water_bottle" | "other") {
  return serviceType === "tiffin" ? "Tiffin service" : serviceType === "water_bottle" ? "Water bottle service" : "Tenant service";
}

async function ensureMonthlyTenantServiceCharges(input: { rentMonth: string; buildingId?: number; roomId?: number; allocationId?: number; createdBy?: number | null }) {
  const db = await requireDb();
  const activeServices = await db.select({
    id: tenantServices.id,
    buildingId: tenantServices.buildingId,
    tenantId: tenantServices.tenantId,
    serviceType: tenantServices.serviceType,
    monthlyChargePaise: tenantServices.monthlyChargePaise,
    notes: tenantServices.notes,
    roomId: roomAllocations.roomId,
    moveInDate: roomAllocations.moveInDate,
    rentDueDay: buildings.rentDueDay,
  }).from(tenantServices)
    .innerJoin(roomAllocations, and(eq(roomAllocations.tenantId, tenantServices.tenantId), eq(roomAllocations.buildingId, tenantServices.buildingId), eq(roomAllocations.status, "active")))
    .innerJoin(buildings, eq(buildings.id, tenantServices.buildingId))
    .where(and(eq(tenantServices.active, "active"), input.buildingId ? eq(tenantServices.buildingId, input.buildingId) : undefined, input.roomId ? eq(roomAllocations.roomId, input.roomId) : undefined, input.allocationId ? eq(roomAllocations.id, input.allocationId) : undefined));

  for (const service of activeServices) {
    if (service.moveInDate.slice(0, 7) > input.rentMonth || service.monthlyChargePaise <= 0) continue;
    await syncTenantCharges({
      buildingId: service.buildingId,
      roomId: service.roomId,
      tenantId: service.tenantId,
      liabilityMode: "tenant_assigned",
      sourceType: "tenant_service",
      sourceId: service.id,
      billingMonth: input.rentMonth,
      title: `${formatTenantServiceTitle(service.serviceType)} · ${input.rentMonth}`,
      amountPaise: service.monthlyChargePaise,
      dueDate: getRentDueDate(input.rentMonth, service.rentDueDay),
      notes: service.notes,
      createdBy: input.createdBy ?? null,
    });
  }
}

async function syncRoomRentTotal(input: { buildingId: number; roomId: number }) {
  const db = await requireDb();
  const room = (await db.select({ roomType: rooms.roomType }).from(rooms).where(and(eq(rooms.id, input.roomId), eq(rooms.buildingId, input.buildingId))).limit(1))[0];
  if (!room) throw new Error("Room not found in the selected building.");
  if (room.roomType === "individual") return null;
  const allocations = await db.select({ monthlyRentPaise: roomAllocations.monthlyRentPaise }).from(roomAllocations).where(and(eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.roomId, input.roomId), eq(roomAllocations.status, "active")));
  const totalRentPaise = calculateRoomRentTotal(allocations.map(allocation => allocation.monthlyRentPaise));
  await db.update(rooms).set({ defaultRentPaise: totalRentPaise }).where(and(eq(rooms.id, input.roomId), eq(rooms.buildingId, input.buildingId)));
  return totalRentPaise;
}

async function syncAutoGeneratedAllocationRent(input: { allocationId: number; buildingId: number; rentMonth: string; monthlyRentPaise: number }) {
  const db = await requireDb();
  const payment = (await db.select({ id: rentPayments.id, status: rentPayments.status, paidAmountPaise: rentPayments.paidAmountPaise, notes: rentPayments.notes }).from(rentPayments).where(and(eq(rentPayments.allocationId, input.allocationId), eq(rentPayments.buildingId, input.buildingId), eq(rentPayments.rentMonth, input.rentMonth))).limit(1))[0];
  if (payment?.status === "pending" && payment.paidAmountPaise === 0 && payment.notes === "Auto-generated monthly rent cycle") {
    await db.update(rentPayments).set({ expectedAmountPaise: input.monthlyRentPaise }).where(eq(rentPayments.id, payment.id));
  }
}

async function syncElectricityTenantCharges(input: { billId: number; buildingId: number; roomId: number; billingMonth: string; billAmountPaise: number; dueDate: string | null; notes: string | null; createdBy: number }) {
  const db = await requireDb();
  const monthStart = `${input.billingMonth}-01`;
  const room = (await db.select({ billingMode: rooms.billingMode }).from(rooms).where(and(eq(rooms.id, input.roomId), eq(rooms.buildingId, input.buildingId))).limit(1))[0];
  if (!room || room.billingMode === "manager_set") {
    await syncTenantCharges({ buildingId: input.buildingId, roomId: input.roomId, tenantId: null, liabilityMode: "building", sourceType: "electricity", sourceId: input.billId, billingMonth: input.billingMonth, title: `Electricity · ${input.billingMonth}`, amountPaise: input.billAmountPaise, dueDate: input.dueDate, notes: input.notes, createdBy: input.createdBy });
    return;
  }
  const allocations = await db.select({ tenantId: roomAllocations.tenantId, isPrimaryPayer: roomAllocations.isPrimaryPayer }).from(roomAllocations).where(and(eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.roomId, input.roomId), lte(roomAllocations.moveInDate, getMonthEnd(input.billingMonth)), or(isNull(roomAllocations.moveOutDate), gte(roomAllocations.moveOutDate, monthStart))));
  const allocationIds = room.billingMode === "primary_payer" ? allocations.filter(allocation => allocation.isPrimaryPayer === "yes").map(allocation => allocation.tenantId) : allocations.map(allocation => allocation.tenantId);
  if (allocationIds.length === 0) {
    await syncTenantCharges({ buildingId: input.buildingId, roomId: input.roomId, tenantId: null, liabilityMode: "building", sourceType: "electricity", sourceId: input.billId, billingMonth: input.billingMonth, title: `Electricity · ${input.billingMonth}`, amountPaise: input.billAmountPaise, dueDate: input.dueDate, notes: input.notes, createdBy: input.createdBy });
    return;
  }
  await syncTenantCharges({ buildingId: input.buildingId, roomId: input.roomId, tenantId: null, liabilityMode: "room_shared", sourceType: "electricity", sourceId: input.billId, billingMonth: input.billingMonth, title: `Electricity · ${input.billingMonth}`, amountPaise: input.billAmountPaise, dueDate: input.dueDate, notes: input.notes, createdBy: input.createdBy, recipientTenantIds: allocationIds });
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required.");
  const db = await requireDb();
  const isOwner = user.openId === ENV.ownerOpenId;
  await db.insert(users).values({
    ...user,
    role: user.role ?? (isOwner ? "admin" : "helper"),
    lastSignedIn: user.lastSignedIn ?? new Date(),
  }).onConflictDoUpdate({
    target: users.openId,
    set: {
      name: user.name ?? null,
      email: user.email ?? null,
      loginMethod: user.loginMethod ?? null,
      lastSignedIn: new Date(),
      ...(isOwner ? { role: "admin" as const } : {}),
    },
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
}

export async function getUserByPhone(phone: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.phone, phone)).limit(1))[0];
}

export async function getBuildingForUser(buildingId: number, userId: number, role: AppRole) {
  const db = await requireDb();
  if (role === "admin") {
    return (await db.select().from(buildings).where(and(eq(buildings.id, buildingId), eq(buildings.ownerId, userId))).limit(1))[0];
  }
  if (role === "manager") {
    const result = await db.select({ building: buildings })
      .from(buildings)
      .innerJoin(staffAssignments, and(eq(staffAssignments.buildingId, buildings.id), eq(staffAssignments.userId, userId)))
      .where(eq(buildings.id, buildingId))
      .limit(1);
    return result[0]?.building;
  }
  const result = await db.select({ building: buildings })
    .from(buildings)
    .innerJoin(staffAssignments, and(eq(staffAssignments.buildingId, buildings.id), eq(staffAssignments.userId, userId)))
    .where(eq(buildings.id, buildingId))
    .limit(1);
  return result[0]?.building;
}

export async function listBuildingsForUser(user: User) {
  const db = await requireDb();
  if (user.role === "admin") return db.select().from(buildings).where(eq(buildings.ownerId, user.id)).orderBy(desc(buildings.createdAt));
  if (user.role === "manager") {
    const result = await db.select({ building: buildings })
      .from(buildings)
      .innerJoin(staffAssignments, and(eq(staffAssignments.buildingId, buildings.id), eq(staffAssignments.userId, user.id)))
      .orderBy(desc(buildings.createdAt));
    return result.map(row => row.building);
  }
  const result = await db.select({ building: buildings })
    .from(buildings)
    .innerJoin(staffAssignments, and(eq(staffAssignments.buildingId, buildings.id), eq(staffAssignments.userId, user.id)))
    .orderBy(desc(buildings.createdAt));
  return result.map(row => row.building);
}

export async function createBuilding(input: { name: string; address: string; city?: string; landmark?: string; contactPhone?: string; imageUrl?: string; mapUrl?: string; ownerCutPercent?: number; ownerMonthlyCutPaise?: number; electricityRatePaise: number; ownerId: number }) {
  const db = await requireDb();
  const [result] = await db.insert(buildings).values({ ...input, city: input.city || null, landmark: input.landmark || null, contactPhone: input.contactPhone || null, imageUrl: input.imageUrl || null, mapUrl: input.mapUrl || null, ownerCutPercent: input.ownerCutPercent ?? 0, ownerMonthlyCutPaise: input.ownerMonthlyCutPaise ?? 0 }).returning({ id: buildings.id });
  if (!result) throw new Error("Building could not be created.");
  return result.id;
}

export async function updateBuilding(input: { id: number; name: string; address: string; city: string | null; landmark: string | null; contactPhone: string | null; imageUrl: string | null; mapUrl: string | null; ownerCutPercent: number; ownerMonthlyCutPaise: number; paymentBankName: string | null; paymentAccountName: string | null; paymentAccountNumber: string | null; paymentIfsc: string | null; paymentUpiId: string | null; paymentQrUrl: string | null; electricityRatePaise: number }) {
  const db = await requireDb();
  await db.update(buildings).set({ name: input.name, address: input.address, city: input.city, landmark: input.landmark, contactPhone: input.contactPhone, imageUrl: input.imageUrl, mapUrl: input.mapUrl, ownerCutPercent: input.ownerCutPercent, ownerMonthlyCutPaise: input.ownerMonthlyCutPaise, paymentBankName: input.paymentBankName, paymentAccountName: input.paymentAccountName, paymentAccountNumber: input.paymentAccountNumber, paymentIfsc: input.paymentIfsc, paymentUpiId: input.paymentUpiId, paymentQrUrl: input.paymentQrUrl, electricityRatePaise: input.electricityRatePaise }).where(eq(buildings.id, input.id));
}

export function getBuildingDeletionBlockReason(dependencies: { floors: number; rooms: number; tenants: number; allocations: number; rentPayments: number; electricityBills: number; expenses: number; operatingCosts: number; reminders: number }) {
  return Object.values(dependencies).some(count => count > 0)
    ? "This building cannot be deleted while floors, rooms, tenants, billing, expenses, operating costs, or reminders exist. Remove operational records first."
    : null;
}

export function getRoomDeletionBlockReason(dependencies: { allocations: number; electricityBills: number }) {
  return dependencies.allocations > 0 || dependencies.electricityBills > 0
    ? "This room cannot be deleted while tenant allocations or electricity bills exist. Vacate the room and preserve its billing history first."
    : null;
}

export function getTenantDeletionBlockReason(dependencies: { allocations: number; rentPayments: number; electricityBills: number; reminders: number }) {
  return dependencies.allocations > 0 || dependencies.rentPayments > 0 || dependencies.electricityBills > 0 || dependencies.reminders > 0
    ? "This tenant cannot be deleted because allocation, rent, electricity, or reminder history must be preserved. Use Offboard tenant instead."
    : null;
}

export async function deleteBuilding(buildingId: number) {
  const db = await requireDb();
  const [floorRows, roomRows, tenantRows, allocationRows, rentRows, electricityRows, expenseRows, operatingCostRows, reminderRows] = await Promise.all([
    db.select({ id: floors.id }).from(floors).where(eq(floors.buildingId, buildingId)).limit(1),
    db.select({ id: rooms.id }).from(rooms).where(eq(rooms.buildingId, buildingId)).limit(1),
    db.select({ id: tenants.id }).from(tenants).where(eq(tenants.buildingId, buildingId)).limit(1),
    db.select({ id: roomAllocations.id }).from(roomAllocations).where(eq(roomAllocations.buildingId, buildingId)).limit(1),
    db.select({ id: rentPayments.id }).from(rentPayments).where(eq(rentPayments.buildingId, buildingId)).limit(1),
    db.select({ id: electricityBills.id }).from(electricityBills).where(eq(electricityBills.buildingId, buildingId)).limit(1),
    db.select({ id: expenses.id }).from(expenses).where(eq(expenses.buildingId, buildingId)).limit(1),
    db.select({ id: operatingCosts.id }).from(operatingCosts).where(eq(operatingCosts.buildingId, buildingId)).limit(1),
    db.select({ id: reminders.id }).from(reminders).where(eq(reminders.buildingId, buildingId)).limit(1),
  ]);
  const blockReason = getBuildingDeletionBlockReason({ floors: floorRows.length, rooms: roomRows.length, tenants: tenantRows.length, allocations: allocationRows.length, rentPayments: rentRows.length, electricityBills: electricityRows.length, expenses: expenseRows.length, operatingCosts: operatingCostRows.length, reminders: reminderRows.length });
  if (blockReason) throw new Error(blockReason);
  await db.delete(staffAssignments).where(eq(staffAssignments.buildingId, buildingId));
  await db.delete(buildings).where(eq(buildings.id, buildingId));
}

export function buildGeneratedFloors(floorCount: number) {
  if (!Number.isInteger(floorCount) || floorCount < 0 || floorCount > 200) throw new Error("Floor count must be a whole number between 0 and 200.");
  return [
    { name: "Ground Floor", level: 0 },
    ...Array.from({ length: floorCount }, (_, index) => ({ name: `Floor ${index + 1}`, level: index + 1 })),
    { name: "Terrace", level: floorCount + 1 },
  ];
}

export async function addFloor(input: { buildingId: number; name: string; level: number }) {
  const db = await requireDb();
  await db.insert(floors).values(input);
}

export async function addGeneratedFloors(input: { buildingId: number; floorCount: number }) {
  const db = await requireDb();
  const desired = buildGeneratedFloors(input.floorCount);
  return db.transaction(async tx => {
    const existing = await tx.select({ name: floors.name, level: floors.level }).from(floors).where(eq(floors.buildingId, input.buildingId));
    const missing = desired.filter(item => !existing.some(row => row.name === item.name && row.level === item.level));
    if (missing.length > 0) await tx.insert(floors).values(missing.map(item => ({ ...item, buildingId: input.buildingId })));
    return { createdCount: missing.length, totalCount: desired.length };
  });
}

export function getFloorDeletionBlockReason(roomCount: number) {
  return roomCount > 0 ? "This floor cannot be deleted while rooms are assigned to it. Move or delete the rooms first." : null;
}

export async function deleteFloor(input: { id: number; buildingId: number }) {
  const db = await requireDb();
  const roomRows = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.floorId, input.id), eq(rooms.buildingId, input.buildingId))).limit(1);
  const blockReason = getFloorDeletionBlockReason(roomRows.length);
  if (blockReason) throw new Error(blockReason);
  await db.delete(floors).where(and(eq(floors.id, input.id), eq(floors.buildingId, input.buildingId)));
}

export async function addRoom(input: { buildingId: number; floorId: number | null; number: string; capacity: number; roomType: RoomType; billingMode: RoomBillingMode; airConditioning: "ac" | "non_ac"; balcony: "balcony" | "non_balcony"; imageUrl: string | null; defaultRentPaise: number }) {
  const db = await requireDb();
  await db.insert(rooms).values(input);
}

export async function createRoomWithTenantSetup(input: { buildingId: number; floorId: number | null; number: string; capacity: number; roomType: RoomType; billingMode: RoomBillingMode; airConditioning: "ac" | "non_ac"; balcony: "balcony" | "non_balcony"; imageUrl: string | null; defaultRentPaise: number; tenant: { fullName: string; phone: string; email: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; address: string | null; identityDocumentUrl: string | null; passwordHash: string }; allocation: { moveInDate: string; bedLabel: string | null; isPrimaryPayer: "no" | "yes"; monthlyRentPaise: number; depositPaise: number }; services: Array<{ serviceType: "tiffin" | "water_bottle" | "other"; monthlyChargePaise: number; notes: string | null; createdBy: number }> }) {
  const db = await requireDb();
  let roomId = 0;
  let tenantId = 0;
  let allocationId = 0;
  await db.transaction(async tx => {
    const [roomResult] = await tx.insert(rooms).values({ buildingId: input.buildingId, floorId: input.floorId, number: input.number, capacity: input.capacity, roomType: input.roomType, billingMode: input.billingMode, airConditioning: input.airConditioning, balcony: input.balcony, imageUrl: input.imageUrl, defaultRentPaise: input.defaultRentPaise }).returning({ id: rooms.id });
    if (!roomResult) throw new Error("Room could not be created.");
    roomId = roomResult.id;
    const [userResult] = await tx.insert(users).values({ openId: `tenant-${input.tenant.phone}-${Date.now()}`, name: input.tenant.fullName, email: input.tenant.email, phone: input.tenant.phone, passwordHash: input.tenant.passwordHash, loginMethod: "phone-password", role: "tenant" }).returning({ id: users.id });
    if (!userResult) throw new Error("Tenant login could not be created.");
    const userId = userResult.id;
    const [tenantResult] = await tx.insert(tenants).values({ buildingId: input.buildingId, userId, fullName: input.tenant.fullName, phone: input.tenant.phone, email: input.tenant.email, emergencyContactName: input.tenant.emergencyContactName, emergencyContactPhone: input.tenant.emergencyContactPhone, address: input.tenant.address, identityDocumentUrl: input.tenant.identityDocumentUrl }).returning({ id: tenants.id });
    if (!tenantResult) throw new Error("Tenant could not be created.");
    tenantId = tenantResult.id;
    const [allocationResult] = await tx.insert(roomAllocations).values({ buildingId: input.buildingId, roomId, tenantId, activeTenantId: tenantId, moveInDate: input.allocation.moveInDate, bedLabel: input.allocation.bedLabel, isPrimaryPayer: input.allocation.isPrimaryPayer, monthlyRentPaise: input.allocation.monthlyRentPaise, depositPaise: input.allocation.depositPaise }).returning({ id: roomAllocations.id });
    if (!allocationResult) throw new Error("Room allocation could not be created.");
    allocationId = allocationResult.id;
    if (input.services.length > 0) await tx.insert(tenantServices).values(input.services.map(service => ({ ...service, buildingId: input.buildingId, tenantId })));
  });
  await ensureMonthlyRentCycles({ rentMonth: formatRentMonth(new Date()), buildingId: input.buildingId, roomId, createdBy: null });
  await syncRoomRentTotal({ buildingId: input.buildingId, roomId });
  return { roomId, tenantId, allocationId };
}

export async function updateRoom(input: { id: number; buildingId: number; floorId: number | null; number: string; capacity: number; roomType: RoomType; billingMode: RoomBillingMode; airConditioning: "ac" | "non_ac"; balcony: "balcony" | "non_balcony"; imageUrl: string | null; defaultRentPaise: number }) {
  const db = await requireDb();
  await db.update(rooms).set({ floorId: input.floorId, number: input.number, capacity: input.capacity, roomType: input.roomType, billingMode: input.billingMode, airConditioning: input.airConditioning, balcony: input.balcony, imageUrl: input.imageUrl, defaultRentPaise: input.defaultRentPaise }).where(and(eq(rooms.id, input.id), eq(rooms.buildingId, input.buildingId)));
}

export async function deleteRoom(input: { id: number; buildingId: number }) {
  const db = await requireDb();
  const [allocationRows, electricityRows] = await Promise.all([
    db.select({ id: roomAllocations.id }).from(roomAllocations).where(and(eq(roomAllocations.roomId, input.id), eq(roomAllocations.buildingId, input.buildingId))).limit(1),
    db.select({ id: electricityBills.id }).from(electricityBills).where(and(eq(electricityBills.roomId, input.id), eq(electricityBills.buildingId, input.buildingId))).limit(1),
  ]);
  const blockReason = getRoomDeletionBlockReason({ allocations: allocationRows.length, electricityBills: electricityRows.length });
  if (blockReason) throw new Error(blockReason);
  await db.delete(rooms).where(and(eq(rooms.id, input.id), eq(rooms.buildingId, input.buildingId)));
}

export async function createTenant(input: { buildingId: number; fullName: string; phone: string; email: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; address: string | null; identityDocumentUrl: string | null; passwordHash: string }) {
  const db = await requireDb();
  const [userResult] = await db.insert(users).values({ openId: `tenant-${input.phone}-${Date.now()}`, name: input.fullName, email: input.email, phone: input.phone, passwordHash: input.passwordHash, loginMethod: "phone-password", role: "tenant" }).returning({ id: users.id });
  if (!userResult) throw new Error("Tenant login could not be created.");
  const userId = userResult.id;
  await db.insert(tenants).values({ buildingId: input.buildingId, userId, fullName: input.fullName, phone: input.phone, email: input.email, emergencyContactName: input.emergencyContactName, emergencyContactPhone: input.emergencyContactPhone, address: input.address, identityDocumentUrl: input.identityDocumentUrl });
}

export async function updateTenant(input: { id: number; buildingId: number; fullName: string; phone: string; email: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; address: string | null; identityDocumentUrl: string | null; status: "active" | "inactive" }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const tenant = (await tx.select({ userId: tenants.userId })
      .from(tenants)
      .where(and(eq(tenants.id, input.id), eq(tenants.buildingId, input.buildingId)))
      .limit(1))[0];
    if (!tenant) throw new Error("Tenant not found in the selected building.");
    await tx.update(tenants).set({ fullName: input.fullName, phone: input.phone, email: input.email, emergencyContactName: input.emergencyContactName, emergencyContactPhone: input.emergencyContactPhone, address: input.address, identityDocumentUrl: input.identityDocumentUrl, status: input.status }).where(and(eq(tenants.id, input.id), eq(tenants.buildingId, input.buildingId)));
    if (tenant.userId) await tx.update(users).set({ phone: input.phone }).where(eq(users.id, tenant.userId));
  });
}

export async function resetTenantCredentials(input: { tenantId: number; buildingId: number; passwordHash: string }) {
  const db = await requireDb();
  await db.transaction(async tx => {
    const tenant = (await tx.select({ userId: tenants.userId, status: tenants.status })
      .from(tenants)
      .where(and(eq(tenants.id, input.tenantId), eq(tenants.buildingId, input.buildingId)))
      .limit(1))[0];
    if (!tenant?.userId) throw new Error("Tenant login is not linked to this profile.");
    if (tenant.status !== "active") throw new Error("Activate the tenant profile before resetting its login.");
    await tx.update(users).set({ passwordHash: input.passwordHash, loginMethod: "phone-password" }).where(eq(users.id, tenant.userId));
  });
}

export async function revokeTenantCredentials(input: { tenantId: number; buildingId: number }) {
  const db = await requireDb();
  const tenant = (await db.select({ userId: tenants.userId }).from(tenants).where(and(eq(tenants.id, input.tenantId), eq(tenants.buildingId, input.buildingId))).limit(1))[0];
  if (!tenant) throw new Error("Tenant not found in the selected building.");
  if (tenant.userId) await db.update(users).set({ passwordHash: null, loginMethod: "revoked" }).where(eq(users.id, tenant.userId));
  await db.update(tenants).set({ status: "inactive" }).where(and(eq(tenants.id, input.tenantId), eq(tenants.buildingId, input.buildingId)));
}

export async function archiveTenant(input: { tenantId: number; buildingId: number; moveOutDate: string }) {
  const db = await requireDb();
  const tenant = (await db.select({ userId: tenants.userId }).from(tenants).where(and(eq(tenants.id, input.tenantId), eq(tenants.buildingId, input.buildingId))).limit(1))[0];
  if (!tenant) throw new Error("Tenant not found in the selected building.");
  await db.update(roomAllocations).set({ status: "vacated", moveOutDate: input.moveOutDate, activeTenantId: null }).where(and(eq(roomAllocations.tenantId, input.tenantId), eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.status, "active")));
  if (tenant.userId) await db.update(users).set({ passwordHash: null, loginMethod: "revoked" }).where(eq(users.id, tenant.userId));
  await db.update(tenants).set({ status: "inactive" }).where(and(eq(tenants.id, input.tenantId), eq(tenants.buildingId, input.buildingId)));
}

export async function deleteTenant(input: { tenantId: number; buildingId: number }) {
  const db = await requireDb();
  const [tenantRow, allocationRows, rentRows, electricityRows, reminderRows] = await Promise.all([
    db.select({ userId: tenants.userId }).from(tenants).where(and(eq(tenants.id, input.tenantId), eq(tenants.buildingId, input.buildingId))).limit(1),
    db.select({ id: roomAllocations.id }).from(roomAllocations).where(and(eq(roomAllocations.tenantId, input.tenantId), eq(roomAllocations.buildingId, input.buildingId))).limit(1),
    db.select({ id: rentPayments.id }).from(rentPayments).where(and(eq(rentPayments.tenantId, input.tenantId), eq(rentPayments.buildingId, input.buildingId))).limit(1),
    db.select({ id: electricityBills.id }).from(electricityBills).innerJoin(roomAllocations, eq(electricityBills.roomId, roomAllocations.roomId)).where(and(eq(roomAllocations.tenantId, input.tenantId), eq(electricityBills.buildingId, input.buildingId))).limit(1),
    db.select({ id: reminders.id }).from(reminders).where(and(eq(reminders.tenantId, input.tenantId), eq(reminders.buildingId, input.buildingId))).limit(1),
  ]);
  if (!tenantRow[0]) throw new Error("Tenant not found in the selected building.");
  const blockReason = getTenantDeletionBlockReason({ allocations: allocationRows.length, rentPayments: rentRows.length, electricityBills: electricityRows.length, reminders: reminderRows.length });
  if (blockReason) throw new Error(blockReason);
  await db.delete(tenants).where(and(eq(tenants.id, input.tenantId), eq(tenants.buildingId, input.buildingId)));
  if (tenantRow[0].userId) await db.delete(users).where(eq(users.id, tenantRow[0].userId));
}

export async function createTenantService(input: { buildingId: number; tenantId: number; serviceType: "tiffin" | "water_bottle" | "other"; monthlyChargePaise: number; notes: string | null; createdBy: number }) {
  const db = await requireDb();
  await db.insert(tenantServices).values(input);
  await ensureMonthlyRentCycles({ rentMonth: formatRentMonth(new Date()), buildingId: input.buildingId, createdBy: input.createdBy });
}

export async function updateTenantService(input: { id: number; buildingId: number; tenantId: number; serviceType: "tiffin" | "water_bottle" | "other"; monthlyChargePaise: number; active: "active" | "inactive"; notes: string | null }) {
  const db = await requireDb();
  await db.update(tenantServices).set({ serviceType: input.serviceType, monthlyChargePaise: input.monthlyChargePaise, active: input.active, notes: input.notes }).where(and(eq(tenantServices.id, input.id), eq(tenantServices.buildingId, input.buildingId), eq(tenantServices.tenantId, input.tenantId)));
  if (input.active === "active") await ensureMonthlyRentCycles({ rentMonth: formatRentMonth(new Date()), buildingId: input.buildingId, createdBy: null });
}

export async function deleteTenantService(input: { id: number; buildingId: number; tenantId: number }) {
  const db = await requireDb();
  await db.delete(tenantServices).where(and(eq(tenantServices.id, input.id), eq(tenantServices.buildingId, input.buildingId), eq(tenantServices.tenantId, input.tenantId)));
}

export async function createAllocation(input: { buildingId: number; roomId: number; tenantId: number; moveInDate: string; bedLabel?: string; isPrimaryPayer?: "no" | "yes"; monthlyRentPaise: number; depositPaise: number }) {
  const db = await requireDb();
  let allocationId = 0;
  await db.transaction(async tx => {
    const room = (await tx.select({ id: rooms.id, capacity: rooms.capacity, defaultRentPaise: rooms.defaultRentPaise, billingMode: rooms.billingMode })
      .from(rooms)
      .where(and(eq(rooms.id, input.roomId), eq(rooms.buildingId, input.buildingId)))
      .for("update"))[0];
    if (!room) throw new Error("Room not found in the selected building.");

    const activeAllocations = await tx.select({ id: roomAllocations.id, isPrimaryPayer: roomAllocations.isPrimaryPayer })
      .from(roomAllocations)
      .where(and(eq(roomAllocations.roomId, input.roomId), eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.status, "active")))
      .for("update");
    if (activeAllocations.length >= room.capacity) throw new Error("This room has no vacant bed remaining.");

    const tenantAllocation = await tx.select({ id: roomAllocations.id })
      .from(roomAllocations)
      .where(and(eq(roomAllocations.tenantId, input.tenantId), eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.status, "active")))
      .limit(1);
    if (tenantAllocation[0]) throw new Error("This tenant already has an active room allocation.");

    if (room.billingMode === "primary_payer" && input.isPrimaryPayer === "yes" && activeAllocations.some(allocation => allocation.isPrimaryPayer === "yes")) throw new Error("This Co-living room already has a primary payer. Update the existing primary allocation first.");
    const isPrimaryPayer = room.billingMode === "primary_payer" && !activeAllocations.some(allocation => allocation.isPrimaryPayer === "yes") ? "yes" : input.isPrimaryPayer ?? "no";
    const [result] = await tx.insert(roomAllocations).values({ ...input, isPrimaryPayer, activeTenantId: input.tenantId, bedLabel: input.bedLabel || null }).returning({ id: roomAllocations.id });
    if (!result) throw new Error("Room allocation could not be created.");
    allocationId = result.id;
  });
  const rentMonth = formatRentMonth(new Date());
  await ensureMonthlyRentCycles({ rentMonth, buildingId: input.buildingId, roomId: input.roomId, createdBy: null });
  await syncRoomRentTotal({ buildingId: input.buildingId, roomId: input.roomId });
  return allocationId;
}

export async function createAllocationWithServices(input: { buildingId: number; roomId: number; tenantId: number; moveInDate: string; bedLabel?: string; isPrimaryPayer?: "no" | "yes"; monthlyRentPaise: number; depositPaise: number; services: Array<{ serviceType: "tiffin" | "water_bottle" | "other"; monthlyChargePaise: number; notes: string | null; createdBy: number }> }) {
  const allocationId = await createAllocation(input);
  if (input.services.length > 0) {
    const db = await requireDb();
    await db.insert(tenantServices).values(input.services.map(service => ({ ...service, buildingId: input.buildingId, tenantId: input.tenantId })));
    await ensureMonthlyRentCycles({ rentMonth: formatRentMonth(new Date()), buildingId: input.buildingId, roomId: input.roomId, allocationId, createdBy: input.services[0]?.createdBy ?? null });
  }
  return allocationId;
}

export async function createTenantWithAllocationAndServices(input: { buildingId: number; roomId: number; tenant: { fullName: string; phone: string; email: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; address: string | null; identityDocumentUrl: string | null; passwordHash: string }; allocation: { moveInDate: string; bedLabel: string | null; isPrimaryPayer: "no" | "yes"; monthlyRentPaise: number; depositPaise: number }; services: Array<{ serviceType: "tiffin" | "water_bottle" | "other"; monthlyChargePaise: number; notes: string | null; createdBy: number }> }) {
  const db = await requireDb();
  let tenantId = 0;
  let allocationId = 0;
  await db.transaction(async tx => {
    const room = (await tx.select({ capacity: rooms.capacity, billingMode: rooms.billingMode }).from(rooms).where(and(eq(rooms.id, input.roomId), eq(rooms.buildingId, input.buildingId))).for("update"))[0];
    if (!room) throw new Error("Room not found in the selected building.");
    const activeAllocations = await tx.select({ id: roomAllocations.id, isPrimaryPayer: roomAllocations.isPrimaryPayer }).from(roomAllocations).where(and(eq(roomAllocations.roomId, input.roomId), eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.status, "active"))).for("update");
    if (activeAllocations.length >= room.capacity) throw new Error("This room has no vacant bed remaining.");
    const [userResult] = await tx.insert(users).values({ openId: `tenant-${input.tenant.phone}-${Date.now()}`, name: input.tenant.fullName, email: input.tenant.email, phone: input.tenant.phone, passwordHash: input.tenant.passwordHash, loginMethod: "phone-password", role: "tenant" }).returning({ id: users.id });
    if (!userResult) throw new Error("Tenant login could not be created.");
    const userId = userResult.id;
    const [tenantResult] = await tx.insert(tenants).values({ buildingId: input.buildingId, userId, fullName: input.tenant.fullName, phone: input.tenant.phone, email: input.tenant.email, emergencyContactName: input.tenant.emergencyContactName, emergencyContactPhone: input.tenant.emergencyContactPhone, address: input.tenant.address, identityDocumentUrl: input.tenant.identityDocumentUrl }).returning({ id: tenants.id });
    if (!tenantResult) throw new Error("Tenant could not be created.");
    tenantId = tenantResult.id;
    if (room.billingMode === "primary_payer" && input.allocation.isPrimaryPayer === "yes" && activeAllocations.some(allocation => allocation.isPrimaryPayer === "yes")) throw new Error("This Co-living room already has a primary payer. Update the existing primary allocation first.");
    const isPrimaryPayer = room.billingMode === "primary_payer" && !activeAllocations.some(allocation => allocation.isPrimaryPayer === "yes") ? "yes" : input.allocation.isPrimaryPayer;
    const [allocationResult] = await tx.insert(roomAllocations).values({ buildingId: input.buildingId, roomId: input.roomId, tenantId, activeTenantId: tenantId, moveInDate: input.allocation.moveInDate, bedLabel: input.allocation.bedLabel, isPrimaryPayer, monthlyRentPaise: input.allocation.monthlyRentPaise, depositPaise: input.allocation.depositPaise }).returning({ id: roomAllocations.id });
    if (!allocationResult) throw new Error("Room allocation could not be created.");
    allocationId = allocationResult.id;
    if (input.services.length > 0) await tx.insert(tenantServices).values(input.services.map(service => ({ ...service, buildingId: input.buildingId, tenantId })));
  });
  await ensureMonthlyRentCycles({ rentMonth: formatRentMonth(new Date()), buildingId: input.buildingId, roomId: input.roomId, createdBy: null });
  await syncRoomRentTotal({ buildingId: input.buildingId, roomId: input.roomId });
  return { tenantId, allocationId };
}

export async function vacateAllocation(input: { allocationId: number; buildingId: number; moveOutDate: string }) {
  const db = await requireDb();
  const allocation = (await db.select({ id: roomAllocations.id, roomId: roomAllocations.roomId })
    .from(roomAllocations)
    .where(and(eq(roomAllocations.id, input.allocationId), eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.status, "active")))
    .limit(1))[0];
  if (!allocation) throw new Error("Active allocation not found in the selected building.");
  await db.update(roomAllocations).set({ status: "vacated", moveOutDate: input.moveOutDate, activeTenantId: null }).where(and(eq(roomAllocations.id, input.allocationId), eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.status, "active")));
  await syncRoomRentTotal({ buildingId: input.buildingId, roomId: allocation.roomId });
}

export async function updateAllocation(input: { id: number; buildingId: number; moveInDate: string; bedLabel: string | null; monthlyRentPaise: number; depositPaise: number }) {
  const db = await requireDb();
  const allocation = (await db.select({ roomId: roomAllocations.roomId }).from(roomAllocations).where(and(eq(roomAllocations.id, input.id), eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.status, "active"))).limit(1))[0];
  if (!allocation) throw new Error("Active allocation not found in the selected building.");
  await db.update(roomAllocations).set({ moveInDate: input.moveInDate, bedLabel: input.bedLabel, monthlyRentPaise: input.monthlyRentPaise, depositPaise: input.depositPaise }).where(and(eq(roomAllocations.id, input.id), eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.status, "active")));
  const rentMonth = formatRentMonth(new Date());
  await ensureMonthlyRentCycles({ rentMonth, buildingId: input.buildingId, roomId: allocation.roomId, createdBy: null });
  await syncAutoGeneratedAllocationRent({ allocationId: input.id, buildingId: input.buildingId, rentMonth, monthlyRentPaise: input.monthlyRentPaise });
  await syncRoomRentTotal({ buildingId: input.buildingId, roomId: allocation.roomId });
}

export async function transferActiveTenant(input: { buildingId: number; allocationId: number; destinationRoomId: number; effectiveDate: string; bedLabel: string | null; monthlyRentPaise: number; depositPaise: number; applyProration: boolean; recordedBy: number }) {
  const db = await requireDb();
  let sourceRoomId = 0;
  let destinationAllocationId = 0;
  let destinationRentPaymentId: number | null = null;
  let proration: ReturnType<typeof calculateTransferProration> | null = null;
  await db.transaction(async tx => {
    const sourceAllocation = (await tx.select({ id: roomAllocations.id, roomId: roomAllocations.roomId, tenantId: roomAllocations.tenantId, monthlyRentPaise: roomAllocations.monthlyRentPaise })
      .from(roomAllocations)
      .where(and(eq(roomAllocations.id, input.allocationId), eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.status, "active")))
      .for("update"))[0];
    if (!sourceAllocation) throw new Error("Active tenant allocation not found in the selected building.");
    if (sourceAllocation.roomId === input.destinationRoomId) throw new Error("Choose a different destination room.");
    const destinationRoom = (await tx.select({ id: rooms.id, number: rooms.number, capacity: rooms.capacity })
      .from(rooms)
      .where(and(eq(rooms.id, input.destinationRoomId), eq(rooms.buildingId, input.buildingId)))
      .for("update"))[0];
    if (!destinationRoom) throw new Error("Destination room not found in the selected building.");
    const destinationActive = await tx.select({ id: roomAllocations.id })
      .from(roomAllocations)
      .where(and(eq(roomAllocations.roomId, input.destinationRoomId), eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.status, "active")))
      .for("update");
    if (destinationActive.length >= destinationRoom.capacity) throw new Error("Destination room has no vacant bed remaining.");
    let sourceRent: { id: number; expectedAmountPaise: number; paidAmountPaise: number; status: "paid" | "pending" | "partial"; dueDate: string; notes: string | null } | undefined;
    if (input.applyProration) {
      sourceRent = (await tx.select({ id: rentPayments.id, expectedAmountPaise: rentPayments.expectedAmountPaise, paidAmountPaise: rentPayments.paidAmountPaise, status: rentPayments.status, dueDate: rentPayments.dueDate, notes: rentPayments.notes })
        .from(rentPayments)
        .where(and(eq(rentPayments.allocationId, sourceAllocation.id), eq(rentPayments.buildingId, input.buildingId), eq(rentPayments.rentMonth, input.effectiveDate.slice(0, 7))))
        .for("update"))[0];
      if (!sourceRent) throw new Error("An unpaid rent cycle for the transfer month is required before applying proration.");
      if (sourceRent.status !== "pending" || sourceRent.paidAmountPaise > 0) throw new Error("Prorated transfer rent cannot be applied after source-month collection has started.");
      proration = calculateTransferProration(sourceRent.expectedAmountPaise, input.monthlyRentPaise, input.effectiveDate);
      await tx.update(rentPayments).set({ expectedAmountPaise: proration.sourceExpectedAmountPaise, notes: `${sourceRent.notes ? `${sourceRent.notes} · ` : ""}Prorated through ${input.effectiveDate} (${proration.sourceDays}/${proration.daysInMonth} days).` }).where(eq(rentPayments.id, sourceRent.id));
    }
    await tx.update(roomAllocations).set({ status: "vacated", moveOutDate: input.effectiveDate, activeTenantId: null })
      .where(and(eq(roomAllocations.id, sourceAllocation.id), eq(roomAllocations.buildingId, input.buildingId), eq(roomAllocations.status, "active")));
    const [allocationResult] = await tx.insert(roomAllocations).values({ buildingId: input.buildingId, roomId: input.destinationRoomId, tenantId: sourceAllocation.tenantId, activeTenantId: sourceAllocation.tenantId, moveInDate: input.effectiveDate, bedLabel: input.bedLabel, monthlyRentPaise: input.monthlyRentPaise, depositPaise: input.depositPaise }).returning({ id: roomAllocations.id });
    if (!allocationResult) throw new Error("Destination allocation could not be created.");
    destinationAllocationId = allocationResult.id;
    if (proration && sourceRent) {
      const [rentResult] = await tx.insert(rentPayments).values({ buildingId: input.buildingId, allocationId: destinationAllocationId, tenantId: sourceAllocation.tenantId, rentMonth: proration.rentMonth, dueDate: sourceRent.dueDate, expectedAmountPaise: proration.destinationExpectedAmountPaise, paidAmountPaise: 0, status: "pending", notes: `Prorated from transfer on ${input.effectiveDate} (${proration.destinationDays}/${proration.daysInMonth} days) to Room ${destinationRoom.number}.`, recordedBy: input.recordedBy }).returning({ id: rentPayments.id });
      if (!rentResult) throw new Error("Prorated rent could not be created.");
      destinationRentPaymentId = rentResult.id;
    }
    await tx.insert(tenantTransfers).values({ buildingId: input.buildingId, tenantId: sourceAllocation.tenantId, sourceAllocationId: sourceAllocation.id, destinationAllocationId, sourceRoomId: sourceAllocation.roomId, destinationRoomId: input.destinationRoomId, effectiveDate: input.effectiveDate, sourceMonthlyRentPaise: sourceAllocation.monthlyRentPaise, destinationMonthlyRentPaise: input.monthlyRentPaise, prorationApplied: input.applyProration ? "yes" : "no", sourceProratedAmountPaise: proration?.sourceExpectedAmountPaise ?? null, destinationProratedAmountPaise: proration?.destinationExpectedAmountPaise ?? null, sourceRentPaymentId: sourceRent?.id ?? null, destinationRentPaymentId, recordedBy: input.recordedBy });
    sourceRoomId = sourceAllocation.roomId;
  });
  await syncRoomRentTotal({ buildingId: input.buildingId, roomId: sourceRoomId });
  await syncRoomRentTotal({ buildingId: input.buildingId, roomId: input.destinationRoomId });
  return { destinationAllocationId, sourceRoomId, proration };
}

export async function recordRentPayment(input: { buildingId: number; allocationId: number; tenantId: number; rentMonth: string; dueDate: string; expectedAmountPaise: number; paidAmountPaise: number; status: "paid" | "pending" | "partial"; paidOn: string | null; paymentMethod: "cash" | "upi" | "bank_transfer" | null; notes: string | null; receiptUrl: string | null; recordedBy: number }) {
  const db = await requireDb();
  await db.insert(rentPayments).values(input).onConflictDoUpdate({
    target: [rentPayments.allocationId, rentPayments.rentMonth],
    set: {
      dueDate: input.dueDate,
      expectedAmountPaise: input.expectedAmountPaise,
      paidAmountPaise: input.paidAmountPaise,
      status: input.status,
      paidOn: input.paidOn,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
      receiptUrl: input.receiptUrl,
      recordedBy: input.recordedBy,
      ...(input.status === "paid" ? { overdueNotifiedAt: null } : {}),
    },
  });
  const payment = await db.select({ id: rentPayments.id }).from(rentPayments).where(and(eq(rentPayments.allocationId, input.allocationId), eq(rentPayments.rentMonth, input.rentMonth))).limit(1);
  if (!payment[0]) throw new Error("Rent payment was not saved.");
  await syncRentPaymentReminder({ id: payment[0].id, buildingId: input.buildingId, tenantId: input.tenantId, rentMonth: input.rentMonth, dueDate: input.dueDate, status: input.status, createdBy: input.recordedBy });
  if (input.status === "paid") await resolveManagerCollectionNotifications(input.buildingId, [`rent-upcoming-${payment[0].id}`, `rent-overdue-${payment[0].id}`]);
  return payment[0];
}

export async function updateRentPayment(input: { id: number; buildingId: number; expectedUpdatedAt: Date; dueDate: string; expectedAmountPaise: number; paidAmountPaise: number; status: "paid" | "pending" | "partial"; paidOn: string | null; paymentMethod: "cash" | "upi" | "bank_transfer" | null; notes: string | null; receiptUrl: string | null; recordedBy: number }) {
  const db = await requireDb();
  const result = await db.update(rentPayments).set({ dueDate: input.dueDate, expectedAmountPaise: input.expectedAmountPaise, paidAmountPaise: input.paidAmountPaise, status: input.status, paidOn: input.paidOn, paymentMethod: input.paymentMethod, notes: input.notes, receiptUrl: input.receiptUrl, recordedBy: input.recordedBy }).where(and(eq(rentPayments.id, input.id), eq(rentPayments.buildingId, input.buildingId), eq(rentPayments.updatedAt, input.expectedUpdatedAt))).returning({ id: rentPayments.id });
  if (result.length !== 1) throw new Error("This rent record changed on another device. Review the latest record before saving again.");
  const payment = await db.select({ tenantId: rentPayments.tenantId, rentMonth: rentPayments.rentMonth }).from(rentPayments).where(and(eq(rentPayments.id, input.id), eq(rentPayments.buildingId, input.buildingId))).limit(1);
  if (!payment[0]) throw new Error("Rent payment was not found.");
  await syncRentPaymentReminder({ id: input.id, buildingId: input.buildingId, tenantId: payment[0].tenantId, rentMonth: payment[0].rentMonth, dueDate: input.dueDate, status: input.status, createdBy: input.recordedBy });
  if (input.status === "paid") await resolveManagerCollectionNotifications(input.buildingId, [`rent-upcoming-${input.id}`, `rent-overdue-${input.id}`]);
}

export async function getUnnotifiedOverdueRentPayments(today: string) {
  const db = await requireDb();
  return db.select({ id: rentPayments.id, expectedAmountPaise: rentPayments.expectedAmountPaise, paidAmountPaise: rentPayments.paidAmountPaise })
    .from(rentPayments)
    .innerJoin(reminders, and(eq(reminders.rentPaymentId, rentPayments.id), eq(reminders.status, "active")))
    .where(and(lt(rentPayments.dueDate, today), ne(rentPayments.status, "paid"), isNull(rentPayments.overdueNotifiedAt), isNotNull(reminders.deliveryRequestedAt)));
}

export async function markRentPaymentsOverdueNotified(ids: number[]) {
  if (ids.length === 0) return;
  const db = await requireDb();
  for (const id of ids) {
    await db.update(rentPayments).set({ overdueNotifiedAt: new Date() }).where(eq(rentPayments.id, id));
  }
}

export async function triggerRentPaymentReminder(input: { id: number; buildingId: number; createdBy: number }) {
  const db = await requireDb();
  const payment = (await db.select({ id: rentPayments.id, tenantId: rentPayments.tenantId, rentMonth: rentPayments.rentMonth, dueDate: rentPayments.dueDate, status: rentPayments.status })
    .from(rentPayments)
    .where(and(eq(rentPayments.id, input.id), eq(rentPayments.buildingId, input.buildingId)))
    .limit(1))[0];
  if (!payment) throw new Error("Rent payment was not found in the selected building.");
  if (payment.status === "paid") throw new Error("Paid rent does not need a due reminder.");
  const existing = await db.select({ id: reminders.id, status: reminders.status }).from(reminders).where(eq(reminders.rentPaymentId, input.id)).limit(1);
  await syncRentPaymentReminder({ ...payment, buildingId: input.buildingId, createdBy: input.createdBy });
  await db.update(reminders).set({ deliveryRequestedAt: new Date(), deliveryRequestedBy: input.createdBy }).where(and(eq(reminders.rentPaymentId, input.id), eq(reminders.buildingId, input.buildingId), eq(reminders.status, "active")));
  return { created: !existing[0] || existing[0].status === "complete", deliveryRequested: true, title: `Rent due · ${payment.rentMonth}` };
}

export async function recordElectricityBill(input: { buildingId: number; roomId: number; billingMonth: string; previousReading: number; currentReading: number; unitsConsumed: number; ratePerUnitPaise: number; billAmountPaise: number; paidAmountPaise: number; status: "paid" | "pending" | "partial"; paidOn: string | null; paymentMethod: "cash" | "upi" | "bank_transfer" | null; dueDate: string | null; notes: string | null; meterImageUrl: string | null; receiptUrl: string | null; recordedBy: number }) {
  const db = await requireDb();
  await db.insert(electricityBills).values(input).onConflictDoUpdate({
    target: [electricityBills.roomId, electricityBills.billingMonth],
    set: {
      previousReading: input.previousReading,
      currentReading: input.currentReading,
      unitsConsumed: input.unitsConsumed,
      ratePerUnitPaise: input.ratePerUnitPaise,
      billAmountPaise: input.billAmountPaise,
      paidAmountPaise: input.paidAmountPaise,
      status: input.status,
      paidOn: input.paidOn,
      paymentMethod: input.paymentMethod,
      dueDate: input.dueDate,
      notes: input.notes,
      meterImageUrl: input.meterImageUrl,
      receiptUrl: input.receiptUrl,
      recordedBy: input.recordedBy,
    },
  });
  const bill = (await db.select({ id: electricityBills.id }).from(electricityBills).where(and(eq(electricityBills.roomId, input.roomId), eq(electricityBills.billingMonth, input.billingMonth))).limit(1))[0];
  if (!bill) throw new Error("Electricity bill was not saved.");
  await syncElectricityTenantCharges({ billId: bill.id, buildingId: input.buildingId, roomId: input.roomId, billingMonth: input.billingMonth, billAmountPaise: input.billAmountPaise, dueDate: input.dueDate, notes: input.notes, createdBy: input.recordedBy });
  if (input.status === "paid") await resolveManagerCollectionNotifications(input.buildingId, [`electricity-upcoming-${bill.id}`, `electricity-overdue-${bill.id}`]);
}

export async function updateElectricityBill(input: { id: number; buildingId: number; expectedUpdatedAt: Date; previousReading: number; currentReading: number; unitsConsumed: number; ratePerUnitPaise: number; billAmountPaise: number; paidAmountPaise: number; status: "paid" | "pending" | "partial"; paidOn: string | null; paymentMethod: "cash" | "upi" | "bank_transfer" | null; dueDate: string | null; notes: string | null; meterImageUrl: string | null; receiptUrl: string | null; recordedBy: number }) {
  const db = await requireDb();
  const bill = (await db.select({ roomId: electricityBills.roomId, billingMonth: electricityBills.billingMonth }).from(electricityBills).where(and(eq(electricityBills.id, input.id), eq(electricityBills.buildingId, input.buildingId))).limit(1))[0];
  const result = await db.update(electricityBills).set({ previousReading: input.previousReading, currentReading: input.currentReading, unitsConsumed: input.unitsConsumed, ratePerUnitPaise: input.ratePerUnitPaise, billAmountPaise: input.billAmountPaise, paidAmountPaise: input.paidAmountPaise, status: input.status, paidOn: input.paidOn, paymentMethod: input.paymentMethod, dueDate: input.dueDate, notes: input.notes, meterImageUrl: input.meterImageUrl, receiptUrl: input.receiptUrl, recordedBy: input.recordedBy }).where(and(eq(electricityBills.id, input.id), eq(electricityBills.buildingId, input.buildingId), eq(electricityBills.updatedAt, input.expectedUpdatedAt))).returning({ id: electricityBills.id });
  if (result.length !== 1) throw new Error("This electricity record changed on another device. Review the latest record before saving again.");
  if (bill) await syncElectricityTenantCharges({ billId: input.id, buildingId: input.buildingId, roomId: bill.roomId, billingMonth: bill.billingMonth, billAmountPaise: input.billAmountPaise, dueDate: input.dueDate, notes: input.notes, createdBy: input.recordedBy });
  if (input.status === "paid" && bill) {
    const room = (await db.select({ number: rooms.number }).from(rooms).where(and(eq(rooms.id, bill.roomId), eq(rooms.buildingId, input.buildingId))).limit(1))[0];
    const title = `Electricity due · Room ${room?.number ?? bill.roomId} · ${bill.billingMonth}`;
    await db.update(reminders).set({ status: "complete" }).where(and(eq(reminders.buildingId, input.buildingId), eq(reminders.title, title), eq(reminders.status, "active")));
    await resolveManagerCollectionNotifications(input.buildingId, [`electricity-upcoming-${input.id}`, `electricity-overdue-${input.id}`]);
  }
}

export async function recordTenantChargePayment(input: { id: number; buildingId: number; expectedUpdatedAt: Date; paidAmountPaise: number; paidOn: string | null; paymentMethod: "cash" | "upi" | "bank_transfer" | null; receiptUrl: string | null; recordedBy: number }) {
  const db = await requireDb();
  const charge = (await db.select().from(tenantCharges).where(and(eq(tenantCharges.id, input.id), eq(tenantCharges.buildingId, input.buildingId))).limit(1))[0];
  if (!charge) throw new Error("Tenant charge was not found in the selected building.");
  const status = deriveTenantChargeStatus(charge.expectedAmountPaise, input.paidAmountPaise);
  const result = await db.update(tenantCharges).set({ paidAmountPaise: input.paidAmountPaise, status, paidOn: status === "pending" ? null : input.paidOn ?? new Date().toISOString().slice(0, 10), paymentMethod: status === "pending" ? null : input.paymentMethod, receiptUrl: input.receiptUrl, createdBy: input.recordedBy }).where(and(eq(tenantCharges.id, input.id), eq(tenantCharges.buildingId, input.buildingId), eq(tenantCharges.updatedAt, input.expectedUpdatedAt))).returning({ id: tenantCharges.id });
  if (result.length !== 1) throw new Error("This tenant charge changed on another device. Review the latest record before saving again.");
  if (charge.sourceType === "electricity") {
    const charges = await db.select({ paidAmountPaise: tenantCharges.paidAmountPaise, expectedAmountPaise: tenantCharges.expectedAmountPaise }).from(tenantCharges).where(and(eq(tenantCharges.sourceType, "electricity"), eq(tenantCharges.sourceId, charge.sourceId), eq(tenantCharges.buildingId, input.buildingId)));
    const paidAmountPaise = charges.reduce((total, item) => total + item.paidAmountPaise, 0);
    const bill = (await db.select({ billAmountPaise: electricityBills.billAmountPaise }).from(electricityBills).where(and(eq(electricityBills.id, charge.sourceId), eq(electricityBills.buildingId, input.buildingId))).limit(1))[0];
    if (bill) {
      const electricityStatus = paidAmountPaise === 0 ? "pending" as const : paidAmountPaise >= bill.billAmountPaise ? "paid" as const : "partial" as const;
      await db.update(electricityBills).set({ paidAmountPaise, status: electricityStatus, paidOn: electricityStatus === "pending" ? null : input.paidOn ?? new Date().toISOString().slice(0, 10) }).where(and(eq(electricityBills.id, charge.sourceId), eq(electricityBills.buildingId, input.buildingId)));
    }
  }
  return { status };
}

export async function createElectricityOverdueReminder(input: { billId: number; buildingId: number; createdBy: number }) {
  const db = await requireDb();
  const bill = (await db.select({ id: electricityBills.id, roomId: electricityBills.roomId, billingMonth: electricityBills.billingMonth, dueDate: electricityBills.dueDate, status: electricityBills.status })
    .from(electricityBills)
    .where(and(eq(electricityBills.id, input.billId), eq(electricityBills.buildingId, input.buildingId)))
    .limit(1))[0];
  if (!bill) throw new Error("Electricity bill not found in the selected building.");
  if (bill.status === "paid") throw new Error("A paid electricity bill does not need a reminder.");
  if (!bill.dueDate) throw new Error("Set an electricity due date before creating a reminder.");
  const room = (await db.select({ number: rooms.number }).from(rooms).where(and(eq(rooms.id, bill.roomId), eq(rooms.buildingId, input.buildingId))).limit(1))[0];
  const title = `Electricity due · Room ${room?.number ?? bill.roomId} · ${bill.billingMonth}`;
  const existing = await db.select({ id: reminders.id }).from(reminders).where(and(eq(reminders.buildingId, input.buildingId), eq(reminders.title, title), eq(reminders.status, "active"))).limit(1);
  if (!existing[0]) await db.insert(reminders).values({ buildingId: input.buildingId, tenantId: null, rentPaymentId: null, title, dueDate: bill.dueDate, createdBy: input.createdBy });
  return { created: !existing[0], title };
}

export async function createExpense(input: { buildingId: number; roomId: number | null; tenantId: number | null; liabilityMode: LiabilityMode; category: "maintenance" | "groceries" | "salaries" | "utilities" | "rent" | "water" | "labor" | "tiffin" | "other"; amountPaise: number; expenseDate: string; notes: string | null; receiptUrl: string | null; createdBy: number }) {
  const db = await requireDb();
  const [result] = await db.insert(expenses).values(input).returning({ id: expenses.id });
  if (!result) throw new Error("Expense could not be created.");
  const expenseId = result.id;
  await syncTenantCharges({ buildingId: input.buildingId, roomId: input.roomId, tenantId: input.tenantId, liabilityMode: input.liabilityMode, sourceType: "expense", sourceId: expenseId, billingMonth: input.expenseDate.slice(0, 7), title: `${input.category.replace(/\b\w/g, letter => letter.toUpperCase())} expense`, amountPaise: input.amountPaise, dueDate: input.expenseDate, notes: input.notes, createdBy: input.createdBy });
}

export async function updateExpense(input: { id: number; buildingId: number; roomId: number | null; tenantId: number | null; liabilityMode: LiabilityMode; category: "maintenance" | "groceries" | "salaries" | "utilities" | "rent" | "water" | "labor" | "tiffin" | "other"; amountPaise: number; expenseDate: string; notes: string | null; receiptUrl: string | null; expectedUpdatedAt: Date; createdBy: number }) {
  const db = await requireDb();
  const result = await db.update(expenses).set({ roomId: input.roomId, tenantId: input.tenantId, liabilityMode: input.liabilityMode, category: input.category, amountPaise: input.amountPaise, expenseDate: input.expenseDate, notes: input.notes, receiptUrl: input.receiptUrl, createdBy: input.createdBy }).where(and(eq(expenses.id, input.id), eq(expenses.buildingId, input.buildingId), eq(expenses.updatedAt, input.expectedUpdatedAt))).returning({ id: expenses.id });
  if (result.length !== 1) throw new Error("This expense changed on another device. Review the latest record before saving again.");
  await syncTenantCharges({ buildingId: input.buildingId, roomId: input.roomId, tenantId: input.tenantId, liabilityMode: input.liabilityMode, sourceType: "expense", sourceId: input.id, billingMonth: input.expenseDate.slice(0, 7), title: `${input.category.replace(/\b\w/g, letter => letter.toUpperCase())} expense`, amountPaise: input.amountPaise, dueDate: input.expenseDate, notes: input.notes, createdBy: input.createdBy });
}

export async function deleteExpense(input: { id: number; buildingId: number; createdBy: number }) {
  const db = await requireDb();
  return await db.transaction(async tx => {
    const expense = (await tx.select().from(expenses).where(and(eq(expenses.id, input.id), eq(expenses.buildingId, input.buildingId))).limit(1))[0];
    if (!expense) throw new Error("Expense was not found in the selected building.");
    const charges = await tx.select().from(tenantCharges).where(and(eq(tenantCharges.sourceType, "expense"), eq(tenantCharges.sourceId, input.id), eq(tenantCharges.buildingId, input.buildingId)));
    if (charges.some(charge => charge.paidAmountPaise > 0)) throw new Error("This expense has tenant collections. Record an adjustment instead of deleting it.");
    const [audit] = await tx.insert(changeAuditLogs).values({ buildingId: input.buildingId, entityType: "expense", entityId: input.id, action: "deleted", snapshotJson: JSON.stringify({ expense, tenantCharges: charges }), createdBy: input.createdBy }).returning({ id: changeAuditLogs.id });
    if (!audit) throw new Error("Deletion audit could not be recorded.");
    await tx.delete(tenantCharges).where(and(eq(tenantCharges.sourceType, "expense"), eq(tenantCharges.sourceId, input.id), eq(tenantCharges.buildingId, input.buildingId)));
    await tx.delete(expenses).where(and(eq(expenses.id, input.id), eq(expenses.buildingId, input.buildingId)));
    return { auditId: audit.id };
  });
}

export function deriveOperatingCostStatus(amountPaise: number, paidAmountPaise: number) {
  return paidAmountPaise >= amountPaise ? "paid" as const : paidAmountPaise > 0 ? "partial" as const : "pending" as const;
}

type OperatingCostInput = {
  buildingId: number;
  roomId: number | null;
  tenantId: number | null;
  liabilityMode: LiabilityMode;
  kind: "staff" | "supplies" | "maintenance";
  category: "helper_salary" | "cook_salary" | "staff_advance" | "staff_settlement" | "groceries" | "utensils" | "gas" | "cleaning" | "water" | "repair_electrician" | "repair_plumber" | "rent_equipment" | "other";
  title: string;
  payeeName: string | null;
  vendorName: string | null;
  amountPaise: number;
  paidAmountPaise: number;
  workStatus: "open" | "in_progress" | "complete";
  costDate: string;
  dueDate: string | null;
  receiptUrl: string | null;
  notes: string | null;
  createdBy: number;
};

export async function createOperatingCost(input: OperatingCostInput) {
  const db = await requireDb();
  const [result] = await db.insert(operatingCosts).values({ ...input, status: deriveOperatingCostStatus(input.amountPaise, input.paidAmountPaise) }).returning({ id: operatingCosts.id });
  if (!result) throw new Error("Operating cost could not be created.");
  const operatingCostId = result.id;
  await syncTenantCharges({ buildingId: input.buildingId, roomId: input.roomId, tenantId: input.tenantId, liabilityMode: input.liabilityMode, sourceType: "operating_cost", sourceId: operatingCostId, billingMonth: input.costDate.slice(0, 7), title: input.title, amountPaise: input.amountPaise, dueDate: input.dueDate, notes: input.notes, createdBy: input.createdBy });
}

export async function updateOperatingCost(input: OperatingCostInput & { id: number; expectedUpdatedAt: Date }) {
  const db = await requireDb();
  const result = await db.update(operatingCosts).set({ roomId: input.roomId, tenantId: input.tenantId, liabilityMode: input.liabilityMode, kind: input.kind, category: input.category, title: input.title, payeeName: input.payeeName, vendorName: input.vendorName, amountPaise: input.amountPaise, paidAmountPaise: input.paidAmountPaise, status: deriveOperatingCostStatus(input.amountPaise, input.paidAmountPaise), workStatus: input.workStatus, costDate: input.costDate, dueDate: input.dueDate, receiptUrl: input.receiptUrl, notes: input.notes, createdBy: input.createdBy }).where(and(eq(operatingCosts.id, input.id), eq(operatingCosts.buildingId, input.buildingId), eq(operatingCosts.updatedAt, input.expectedUpdatedAt))).returning({ id: operatingCosts.id });
  if (result.length !== 1) throw new Error("This operating cost changed on another device. Review the latest record before saving again.");
  await syncTenantCharges({ buildingId: input.buildingId, roomId: input.roomId, tenantId: input.tenantId, liabilityMode: input.liabilityMode, sourceType: "operating_cost", sourceId: input.id, billingMonth: input.costDate.slice(0, 7), title: input.title, amountPaise: input.amountPaise, dueDate: input.dueDate, notes: input.notes, createdBy: input.createdBy });
}

export async function deleteOperatingCost(input: { id: number; buildingId: number; createdBy: number }) {
  const db = await requireDb();
  return await db.transaction(async tx => {
    const operatingCost = (await tx.select().from(operatingCosts).where(and(eq(operatingCosts.id, input.id), eq(operatingCosts.buildingId, input.buildingId))).limit(1))[0];
    if (!operatingCost) throw new Error("Operating cost was not found in the selected building.");
    const charges = await tx.select().from(tenantCharges).where(and(eq(tenantCharges.sourceType, "operating_cost"), eq(tenantCharges.sourceId, input.id), eq(tenantCharges.buildingId, input.buildingId)));
    if (charges.some(charge => charge.paidAmountPaise > 0)) throw new Error("This operating cost has tenant collections. Record an adjustment instead of deleting it.");
    const [audit] = await tx.insert(changeAuditLogs).values({ buildingId: input.buildingId, entityType: "operating_cost", entityId: input.id, action: "deleted", snapshotJson: JSON.stringify({ operatingCost, tenantCharges: charges }), createdBy: input.createdBy }).returning({ id: changeAuditLogs.id });
    if (!audit) throw new Error("Deletion audit could not be recorded.");
    await tx.delete(tenantCharges).where(and(eq(tenantCharges.sourceType, "operating_cost"), eq(tenantCharges.sourceId, input.id), eq(tenantCharges.buildingId, input.buildingId)));
    await tx.delete(operatingCosts).where(and(eq(operatingCosts.id, input.id), eq(operatingCosts.buildingId, input.buildingId)));
    return { auditId: audit.id };
  });
}

export async function deleteRentPayment(input: { id: number; buildingId: number; createdBy: number }) {
  const db = await requireDb();
  return await db.transaction(async tx => {
    const payment = (await tx.select().from(rentPayments).where(and(eq(rentPayments.id, input.id), eq(rentPayments.buildingId, input.buildingId))).limit(1))[0];
    if (!payment) throw new Error("Rent record was not found in the selected building.");
    const paymentReminders = await tx.select().from(reminders).where(and(eq(reminders.rentPaymentId, input.id), eq(reminders.buildingId, input.buildingId)));
    const [audit] = await tx.insert(changeAuditLogs).values({ buildingId: input.buildingId, entityType: "rent_payment", entityId: input.id, action: "deleted", snapshotJson: JSON.stringify({ payment, reminders: paymentReminders }), createdBy: input.createdBy }).returning({ id: changeAuditLogs.id });
    if (!audit) throw new Error("Deletion audit could not be recorded.");
    await tx.delete(reminders).where(eq(reminders.rentPaymentId, input.id));
    await tx.delete(rentPayments).where(and(eq(rentPayments.id, input.id), eq(rentPayments.buildingId, input.buildingId)));
    return { auditId: audit.id };
  });
}

export async function deleteElectricityBill(input: { id: number; buildingId: number; createdBy: number }) {
  const db = await requireDb();
  return await db.transaction(async tx => {
    const bill = (await tx.select().from(electricityBills).where(and(eq(electricityBills.id, input.id), eq(electricityBills.buildingId, input.buildingId))).limit(1))[0];
    if (!bill) throw new Error("Electricity bill was not found in the selected building.");
    const charges = await tx.select().from(tenantCharges).where(and(eq(tenantCharges.sourceType, "electricity"), eq(tenantCharges.sourceId, input.id), eq(tenantCharges.buildingId, input.buildingId)));
    if (bill.paidAmountPaise > 0 || charges.some(charge => charge.paidAmountPaise > 0)) throw new Error("This electricity bill has recorded collections. Correct the payment amount instead of deleting it.");
    const [audit] = await tx.insert(changeAuditLogs).values({ buildingId: input.buildingId, entityType: "electricity_bill", entityId: input.id, action: "deleted", snapshotJson: JSON.stringify({ bill, tenantCharges: charges }), createdBy: input.createdBy }).returning({ id: changeAuditLogs.id });
    if (!audit) throw new Error("Deletion audit could not be recorded.");
    await tx.delete(tenantCharges).where(and(eq(tenantCharges.sourceType, "electricity"), eq(tenantCharges.sourceId, input.id), eq(tenantCharges.buildingId, input.buildingId)));
    await tx.delete(electricityBills).where(and(eq(electricityBills.id, input.id), eq(electricityBills.buildingId, input.buildingId)));
    return { auditId: audit.id };
  });
}

export async function deleteTenantCharge(input: { id: number; buildingId: number; createdBy: number }) {
  const db = await requireDb();
  return await db.transaction(async tx => {
    const charge = (await tx.select().from(tenantCharges).where(and(eq(tenantCharges.id, input.id), eq(tenantCharges.buildingId, input.buildingId))).limit(1))[0];
    if (!charge) throw new Error("Tenant collection was not found in the selected building.");
    if (charge.paidAmountPaise > 0) throw new Error("This tenant collection has recorded payment. Correct the payment amount instead of deleting it.");
    const [audit] = await tx.insert(changeAuditLogs).values({ buildingId: input.buildingId, entityType: "tenant_charge", entityId: input.id, action: "deleted", snapshotJson: JSON.stringify({ charge }), createdBy: input.createdBy }).returning({ id: changeAuditLogs.id });
    if (!audit) throw new Error("Deletion audit could not be recorded.");
    await tx.delete(tenantCharges).where(and(eq(tenantCharges.id, input.id), eq(tenantCharges.buildingId, input.buildingId)));
    return { auditId: audit.id };
  });
}

const DELETE_UNDO_WINDOW_MS = 10 * 60 * 1000;

type RecoverySnapshot = Record<string, unknown>;

function reviveSnapshotTimestamps(record: Record<string, unknown>) {
  const restored = { ...record };
  for (const key of ["createdAt", "updatedAt", "notifiedAt", "deliveryRequestedAt", "readAt"]) {
    if (typeof restored[key] === "string") {
      const timestamp = new Date(restored[key] as string);
      if (Number.isNaN(timestamp.getTime())) throw new Error("The recovery snapshot contains an invalid timestamp.");
      restored[key] = timestamp;
    }
  }
  return restored;
}

function requireRecoveryRecord(value: unknown, name: string, buildingId: number) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`The ${name} recovery snapshot is invalid.`);
  const record = reviveSnapshotTimestamps(value as Record<string, unknown>);
  if (!Number.isInteger(record.id) || record.buildingId !== buildingId) throw new Error(`The ${name} recovery snapshot does not belong to this building.`);
  return record;
}

function requireRecoveryRows(value: unknown, name: string, buildingId: number) {
  if (!Array.isArray(value)) throw new Error(`The ${name} recovery snapshot is invalid.`);
  return value.map(item => requireRecoveryRecord(item, name, buildingId));
}

function parseRecoverySnapshot(snapshotJson: string) {
  try {
    const snapshot = JSON.parse(snapshotJson) as unknown;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("invalid");
    return snapshot as RecoverySnapshot;
  } catch {
    throw new Error("The recovery snapshot is unavailable.");
  }
}

export async function restoreDeletedEntry(input: { auditId: number; buildingId: number; restoredBy: number }) {
  const db = await requireDb();
  return await db.transaction(async tx => {
    const audit = (await tx.select().from(changeAuditLogs).where(and(eq(changeAuditLogs.id, input.auditId), eq(changeAuditLogs.buildingId, input.buildingId), eq(changeAuditLogs.createdBy, input.restoredBy), eq(changeAuditLogs.action, "deleted"))).limit(1))[0];
    if (!audit) throw new Error("This deletion can no longer be undone by this Manager.");
    if (Date.now() - audit.createdAt.getTime() > DELETE_UNDO_WINDOW_MS) throw new Error("The 10-minute undo window has expired. The audit snapshot remains available for controlled recovery.");

    const snapshot = parseRecoverySnapshot(audit.snapshotJson);
    let restoredLabel: string;

    if (audit.entityType === "rent_payment") {
      const payment = requireRecoveryRecord(snapshot.payment, "rent payment", input.buildingId);
      const remindersSnapshot = snapshot.reminders === undefined ? [] : requireRecoveryRows(snapshot.reminders, "rent reminder", input.buildingId);
      const existing = await tx.select({ id: rentPayments.id }).from(rentPayments).where(and(eq(rentPayments.id, Number(payment.id)), eq(rentPayments.buildingId, input.buildingId))).limit(1);
      if (existing[0]) throw new Error("A replacement record already exists, so this deletion cannot be safely undone.");
      await tx.insert(rentPayments).values(payment as typeof rentPayments.$inferInsert);
      for (const reminder of remindersSnapshot) {
        if (reminder.rentPaymentId !== payment.id) throw new Error("The rent reminder recovery snapshot is inconsistent.");
        const existingReminder = await tx.select({ id: reminders.id }).from(reminders).where(eq(reminders.id, Number(reminder.id))).limit(1);
        if (existingReminder[0]) throw new Error("A replacement reminder already exists, so this deletion cannot be safely undone.");
        await tx.insert(reminders).values(reminder as typeof reminders.$inferInsert);
      }
      restoredLabel = "Rent record";
    } else if (audit.entityType === "electricity_bill") {
      const bill = requireRecoveryRecord(snapshot.bill, "electricity bill", input.buildingId);
      const charges = requireRecoveryRows(snapshot.tenantCharges, "tenant collection", input.buildingId);
      const existing = await tx.select({ id: electricityBills.id }).from(electricityBills).where(and(eq(electricityBills.id, Number(bill.id)), eq(electricityBills.buildingId, input.buildingId))).limit(1);
      if (existing[0]) throw new Error("A replacement record already exists, so this deletion cannot be safely undone.");
      await tx.insert(electricityBills).values(bill as typeof electricityBills.$inferInsert);
      for (const charge of charges) {
        if (charge.sourceType !== "electricity" || charge.sourceId !== bill.id) throw new Error("The electricity recovery snapshot is inconsistent.");
        const existingCharge = await tx.select({ id: tenantCharges.id }).from(tenantCharges).where(and(eq(tenantCharges.id, Number(charge.id)), eq(tenantCharges.buildingId, input.buildingId))).limit(1);
        if (existingCharge[0]) throw new Error("A replacement tenant collection already exists, so this deletion cannot be safely undone.");
        await tx.insert(tenantCharges).values(charge as typeof tenantCharges.$inferInsert);
      }
      restoredLabel = "Electricity bill";
    } else if (audit.entityType === "tenant_charge") {
      const charge = requireRecoveryRecord(snapshot.charge, "tenant collection", input.buildingId);
      const existing = await tx.select({ id: tenantCharges.id }).from(tenantCharges).where(and(eq(tenantCharges.id, Number(charge.id)), eq(tenantCharges.buildingId, input.buildingId))).limit(1);
      if (existing[0]) throw new Error("A replacement record already exists, so this deletion cannot be safely undone.");
      await tx.insert(tenantCharges).values(charge as typeof tenantCharges.$inferInsert);
      restoredLabel = "Tenant collection";
    } else if (audit.entityType === "expense") {
      const expense = requireRecoveryRecord(snapshot.expense, "expense", input.buildingId);
      const charges = requireRecoveryRows(snapshot.tenantCharges, "tenant collection", input.buildingId);
      const existing = await tx.select({ id: expenses.id }).from(expenses).where(and(eq(expenses.id, Number(expense.id)), eq(expenses.buildingId, input.buildingId))).limit(1);
      if (existing[0]) throw new Error("A replacement record already exists, so this deletion cannot be safely undone.");
      await tx.insert(expenses).values(expense as typeof expenses.$inferInsert);
      for (const charge of charges) {
        if (charge.sourceType !== "expense" || charge.sourceId !== expense.id) throw new Error("The expense recovery snapshot is inconsistent.");
        const existingCharge = await tx.select({ id: tenantCharges.id }).from(tenantCharges).where(and(eq(tenantCharges.id, Number(charge.id)), eq(tenantCharges.buildingId, input.buildingId))).limit(1);
        if (existingCharge[0]) throw new Error("A replacement tenant collection already exists, so this deletion cannot be safely undone.");
        await tx.insert(tenantCharges).values(charge as typeof tenantCharges.$inferInsert);
      }
      restoredLabel = "Expense";
    } else if (audit.entityType === "operating_cost") {
      const operatingCost = requireRecoveryRecord(snapshot.operatingCost, "operating cost", input.buildingId);
      const charges = requireRecoveryRows(snapshot.tenantCharges, "tenant collection", input.buildingId);
      const existing = await tx.select({ id: operatingCosts.id }).from(operatingCosts).where(and(eq(operatingCosts.id, Number(operatingCost.id)), eq(operatingCosts.buildingId, input.buildingId))).limit(1);
      if (existing[0]) throw new Error("A replacement record already exists, so this deletion cannot be safely undone.");
      await tx.insert(operatingCosts).values(operatingCost as typeof operatingCosts.$inferInsert);
      for (const charge of charges) {
        if (charge.sourceType !== "operating_cost" || charge.sourceId !== operatingCost.id) throw new Error("The operating-cost recovery snapshot is inconsistent.");
        const existingCharge = await tx.select({ id: tenantCharges.id }).from(tenantCharges).where(and(eq(tenantCharges.id, Number(charge.id)), eq(tenantCharges.buildingId, input.buildingId))).limit(1);
        if (existingCharge[0]) throw new Error("A replacement tenant collection already exists, so this deletion cannot be safely undone.");
        await tx.insert(tenantCharges).values(charge as typeof tenantCharges.$inferInsert);
      }
      restoredLabel = "Operating cost";
    } else if (audit.entityType === "owner_settlement") {
      const settlement = requireRecoveryRecord(snapshot.settlement, "Owner settlement", input.buildingId);
      const existing = await tx.select({ id: ownerSettlements.id }).from(ownerSettlements).where(and(eq(ownerSettlements.id, Number(settlement.id)), eq(ownerSettlements.buildingId, input.buildingId))).limit(1);
      if (existing[0]) throw new Error("A replacement record already exists, so this deletion cannot be safely undone.");
      await tx.insert(ownerSettlements).values(settlement as typeof ownerSettlements.$inferInsert);
      restoredLabel = "Owner settlement";
    } else if (audit.entityType === "government_electricity_payment") {
      const payment = requireRecoveryRecord(snapshot.payment, "building electricity bill", input.buildingId);
      const existing = await tx.select({ id: governmentElectricityPayments.id }).from(governmentElectricityPayments).where(and(eq(governmentElectricityPayments.id, Number(payment.id)), eq(governmentElectricityPayments.buildingId, input.buildingId))).limit(1);
      if (existing[0]) throw new Error("A replacement record already exists, so this deletion cannot be safely undone.");
      await tx.insert(governmentElectricityPayments).values(payment as typeof governmentElectricityPayments.$inferInsert);
      restoredLabel = "Building electricity bill";
    } else {
      throw new Error("This deletion type is not eligible for immediate undo.");
    }

    await tx.update(changeAuditLogs).set({ action: "deleted_undone" }).where(eq(changeAuditLogs.id, audit.id));
    await tx.insert(changeAuditLogs).values({ buildingId: input.buildingId, entityType: audit.entityType, entityId: audit.entityId, action: "restored", snapshotJson: audit.snapshotJson, createdBy: input.restoredBy });
    return { restoredLabel };
  });
}

export async function createServiceCharge(input: { buildingId: number; name: string; amountPaise: number; billingCycle: "monthly" | "one_time"; dueDay: number; notes: string | null; createdBy: number }) {
  const db = await requireDb();
  await db.insert(serviceCharges).values(input);
}

export async function updateServiceCharge(input: { id: number; buildingId: number; name: string; amountPaise: number; billingCycle: "monthly" | "one_time"; dueDay: number; active: "active" | "inactive"; notes: string | null }) {
  const db = await requireDb();
  await db.update(serviceCharges).set({ name: input.name, amountPaise: input.amountPaise, billingCycle: input.billingCycle, dueDay: input.dueDay, active: input.active, notes: input.notes }).where(and(eq(serviceCharges.id, input.id), eq(serviceCharges.buildingId, input.buildingId)));
}

export async function deleteServiceCharge(input: { id: number; buildingId: number }) {
  const db = await requireDb();
  await db.delete(serviceCharges).where(and(eq(serviceCharges.id, input.id), eq(serviceCharges.buildingId, input.buildingId)));
}

export async function createReminder(input: { buildingId: number; tenantId: number | null; rentPaymentId: number | null; title: string; dueDate: string; createdBy: number }) {
  const db = await requireDb();
  await db.insert(reminders).values(input);
}

export async function markReminderComplete(reminderId: number, buildingId: number) {
  const db = await requireDb();
  await db.update(reminders).set({ status: "complete" }).where(and(eq(reminders.id, reminderId), eq(reminders.buildingId, buildingId)));
}

export async function getBuildingSnapshot(buildingId: number) {
  const db = await requireDb();
  const [floorRows, roomRows, tenantRows, tenantServiceRows, allocationRows, rentRows, electricityRows, expenseRows, operatingCostRows, serviceChargeRows, reminderRows, notificationRows, tenantChargeRows, transferRows] = await Promise.all([
    db.select().from(floors).where(eq(floors.buildingId, buildingId)),
    db.select().from(rooms).where(eq(rooms.buildingId, buildingId)),
    db.select().from(tenants).where(eq(tenants.buildingId, buildingId)),
    db.select().from(tenantServices).where(eq(tenantServices.buildingId, buildingId)).orderBy(tenantServices.tenantId),
    db.select().from(roomAllocations).where(eq(roomAllocations.buildingId, buildingId)),
    db.select().from(rentPayments).where(eq(rentPayments.buildingId, buildingId)).orderBy(desc(rentPayments.dueDate)),
    db.select().from(electricityBills).where(eq(electricityBills.buildingId, buildingId)).orderBy(desc(electricityBills.billingMonth)),
    db.select().from(expenses).where(eq(expenses.buildingId, buildingId)).orderBy(desc(expenses.expenseDate)),
    db.select().from(operatingCosts).where(eq(operatingCosts.buildingId, buildingId)).orderBy(desc(operatingCosts.costDate)),
    db.select().from(serviceCharges).where(eq(serviceCharges.buildingId, buildingId)).orderBy(serviceCharges.name),
    db.select().from(reminders).where(eq(reminders.buildingId, buildingId)).orderBy(reminders.dueDate),
    db.select().from(managerNotifications).where(eq(managerNotifications.buildingId, buildingId)).orderBy(desc(managerNotifications.createdAt)).limit(40),
    db.select().from(tenantCharges).where(eq(tenantCharges.buildingId, buildingId)).orderBy(desc(tenantCharges.createdAt)),
    db.select().from(tenantTransfers).where(eq(tenantTransfers.buildingId, buildingId)).orderBy(desc(tenantTransfers.effectiveDate)),
  ]);
  return { floors: floorRows, rooms: roomRows, tenants: tenantRows, tenantServices: tenantServiceRows, allocations: allocationRows, rents: rentRows, electricity: electricityRows, expenses: expenseRows, operatingCosts: operatingCostRows, serviceCharges: serviceChargeRows, reminders: reminderRows, managerNotifications: notificationRows, tenantCharges: tenantChargeRows, tenantTransfers: transferRows };
}

export async function getReceiptReviewHistory(input: { buildingId: number; tenantId?: number; reviewerId?: number; reviewedFrom?: Date; reviewedTo?: Date; paymentMethod?: "cash" | "upi" | "bank_transfer"; amountMinPaise?: number; amountMaxPaise?: number }) {
  const db = await requireDb();
  const rentConditions = [eq(rentPayments.buildingId, input.buildingId), inArray(rentPayments.receiptReviewStatus, ["approved", "rejected"])];
  const electricityConditions = [eq(electricityBills.buildingId, input.buildingId), inArray(electricityBills.receiptReviewStatus, ["approved", "rejected"])];
  const chargeConditions = [eq(tenantCharges.buildingId, input.buildingId), inArray(tenantCharges.receiptReviewStatus, ["approved", "rejected"])];
  if (input.reviewedFrom) { rentConditions.push(gte(rentPayments.receiptReviewedAt, input.reviewedFrom)); electricityConditions.push(gte(electricityBills.receiptReviewedAt, input.reviewedFrom)); chargeConditions.push(gte(tenantCharges.receiptReviewedAt, input.reviewedFrom)); }
  if (input.reviewedTo) { rentConditions.push(lte(rentPayments.receiptReviewedAt, input.reviewedTo)); electricityConditions.push(lte(electricityBills.receiptReviewedAt, input.reviewedTo)); chargeConditions.push(lte(tenantCharges.receiptReviewedAt, input.reviewedTo)); }
  if (input.tenantId) { rentConditions.push(eq(rentPayments.tenantId, input.tenantId)); chargeConditions.push(eq(tenantCharges.tenantId, input.tenantId)); }
  if (input.reviewerId) { rentConditions.push(eq(rentPayments.receiptReviewedBy, input.reviewerId)); electricityConditions.push(eq(electricityBills.receiptReviewedBy, input.reviewerId)); chargeConditions.push(eq(tenantCharges.receiptReviewedBy, input.reviewerId)); }
  if (input.paymentMethod) { rentConditions.push(eq(rentPayments.paymentMethod, input.paymentMethod)); electricityConditions.push(eq(electricityBills.paymentMethod, input.paymentMethod)); chargeConditions.push(eq(tenantCharges.paymentMethod, input.paymentMethod)); }
  if (input.amountMinPaise !== undefined) { rentConditions.push(gte(rentPayments.expectedAmountPaise, input.amountMinPaise)); electricityConditions.push(gte(electricityBills.billAmountPaise, input.amountMinPaise)); chargeConditions.push(gte(tenantCharges.expectedAmountPaise, input.amountMinPaise)); }
  if (input.amountMaxPaise !== undefined) { rentConditions.push(lte(rentPayments.expectedAmountPaise, input.amountMaxPaise)); electricityConditions.push(lte(electricityBills.billAmountPaise, input.amountMaxPaise)); chargeConditions.push(lte(tenantCharges.expectedAmountPaise, input.amountMaxPaise)); }
  const [rentRows, electricityRows, chargeRows, tenantRows, roomRows, reviewerRows] = await Promise.all([
    db.select().from(rentPayments).where(and(...rentConditions)),
    input.tenantId ? Promise.resolve([]) : db.select().from(electricityBills).where(and(...electricityConditions)),
    db.select().from(tenantCharges).where(and(...chargeConditions)),
    db.select({ id: tenants.id, fullName: tenants.fullName }).from(tenants).where(eq(tenants.buildingId, input.buildingId)),
    db.select({ id: rooms.id, number: rooms.number }).from(rooms).where(eq(rooms.buildingId, input.buildingId)),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);
  const tenantName = new Map(tenantRows.map(tenant => [tenant.id, tenant.fullName]));
  const roomNumber = new Map(roomRows.map(room => [room.id, room.number]));
  const reviewerName = new Map(reviewerRows.map(reviewer => [reviewer.id, reviewer.name ?? "Manager"]));
  return [
    ...rentRows.map(row => ({ type: "rent" as const, id: row.id, status: row.receiptReviewStatus, reviewNote: row.receiptReviewNote, reviewedAt: row.receiptReviewedAt, reviewerId: row.receiptReviewedBy, reviewerName: row.receiptReviewedBy ? reviewerName.get(row.receiptReviewedBy) ?? "Manager" : "Manager", receiptUrl: row.receiptUrl, paymentMethod: row.paymentMethod, title: `Rent · ${row.rentMonth}`, subject: tenantName.get(row.tenantId) ?? "Tenant", amountPaise: row.expectedAmountPaise })),
    ...electricityRows.map(row => ({ type: "electricity" as const, id: row.id, status: row.receiptReviewStatus, reviewNote: row.receiptReviewNote, reviewedAt: row.receiptReviewedAt, reviewerId: row.receiptReviewedBy, reviewerName: row.receiptReviewedBy ? reviewerName.get(row.receiptReviewedBy) ?? "Manager" : "Manager", receiptUrl: row.receiptUrl, paymentMethod: row.paymentMethod, title: `Electricity · ${row.billingMonth}`, subject: `Room ${roomNumber.get(row.roomId) ?? "—"}`, amountPaise: row.billAmountPaise })),
    ...chargeRows.map(row => ({ type: "tenant_charge" as const, id: row.id, status: row.receiptReviewStatus, reviewNote: row.receiptReviewNote, reviewedAt: row.receiptReviewedAt, reviewerId: row.receiptReviewedBy, reviewerName: row.receiptReviewedBy ? reviewerName.get(row.receiptReviewedBy) ?? "Manager" : "Manager", receiptUrl: row.receiptUrl, paymentMethod: row.paymentMethod, title: row.title, subject: tenantName.get(row.tenantId) ?? "Tenant", amountPaise: row.expectedAmountPaise })),
  ].sort((left, right) => (right.reviewedAt?.getTime() ?? 0) - (left.reviewedAt?.getTime() ?? 0));
}

export async function listReceiptReviewers(buildingId: number) {
  const db = await requireDb();
  const [rentRows, electricityRows, chargeRows] = await Promise.all([
    db.select({ reviewerId: rentPayments.receiptReviewedBy }).from(rentPayments).where(and(eq(rentPayments.buildingId, buildingId), inArray(rentPayments.receiptReviewStatus, ["approved", "rejected"]))),
    db.select({ reviewerId: electricityBills.receiptReviewedBy }).from(electricityBills).where(and(eq(electricityBills.buildingId, buildingId), inArray(electricityBills.receiptReviewStatus, ["approved", "rejected"]))),
    db.select({ reviewerId: tenantCharges.receiptReviewedBy }).from(tenantCharges).where(and(eq(tenantCharges.buildingId, buildingId), inArray(tenantCharges.receiptReviewStatus, ["approved", "rejected"]))),
  ]);
  const reviewerIds = Array.from(new Set([...rentRows, ...electricityRows, ...chargeRows].map(row => row.reviewerId).filter((reviewerId): reviewerId is number => reviewerId !== null)));
  if (reviewerIds.length === 0) return [];
  return db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, reviewerIds)).orderBy(users.name);
}

export async function getDashboardOverview(buildingId: number, totalBuildings: number, periodMode: "monthly" | "yearly" = "monthly", periodKey?: string) {
  const snapshot = await getBuildingSnapshot(buildingId);
  const db = await requireDb();
  const building = (await db.select().from(buildings).where(eq(buildings.id, buildingId)).limit(1))[0];
  if (!building) throw new Error("Selected building not found.");
  const period = getDashboardPeriod(periodMode, new Date(), periodKey);
  const month = period.key;
  const matchesPeriod = (value: string) => value.startsWith(month);
  const today = new Date().toISOString().slice(0, 10);
  const activeAllocations = snapshot.allocations.filter(allocation => allocation.status === "active");
  const roomById = new Map(snapshot.rooms.map(room => [room.id, room]));
  const tenantById = new Map(snapshot.tenants.map(tenant => [tenant.id, tenant]));
  const activeAllocationByTenantId = new Map(activeAllocations.map(allocation => [allocation.tenantId, allocation]));
  const allocationCounts = new Map<number, number>();
  activeAllocations.forEach(allocation => allocationCounts.set(allocation.roomId, (allocationCounts.get(allocation.roomId) ?? 0) + 1));
  const roomStates = snapshot.rooms.map(room => ({ roomId: room.id, roomNumber: room.number, ...getRoomOccupancy(room.capacity, allocationCounts.get(room.id) ?? 0) }));
  const monthlyRents = snapshot.rents.filter(rent => matchesPeriod(rent.rentMonth));
  const collectedPaise = monthlyRents.reduce((total, rent) => total + rent.paidAmountPaise, 0);
  const expectedRentPaise = monthlyRents.reduce((total, rent) => total + rent.expectedAmountPaise, 0);
  const pendingPaise = monthlyRents.reduce((total, rent) => total + Math.max(rent.expectedAmountPaise - rent.paidAmountPaise, 0), 0);
  const monthlyExpensePaise = snapshot.expenses.filter(expense => matchesPeriod(expense.expenseDate)).reduce((total, expense) => total + expense.amountPaise, 0);
  const monthlyOperatingCostPaise = snapshot.operatingCosts.filter(cost => matchesPeriod(cost.costDate)).reduce((total, cost) => total + cost.amountPaise, 0);
  const monthlyOperatingCostPaidPaise = snapshot.operatingCosts.filter(cost => matchesPeriod(cost.costDate)).reduce((total, cost) => total + cost.paidAmountPaise, 0);
  const monthlyServiceChargePaise = snapshot.serviceCharges.filter(charge => charge.active === "active" && charge.billingCycle === "monthly").reduce((total, charge) => total + charge.amountPaise, 0);
  const monthlyTenantServicePaise = snapshot.tenantServices.filter(service => service.active === "active").reduce((total, service) => total + service.monthlyChargePaise, 0);
  const monthlyElectricityBilledPaise = snapshot.electricity.filter(bill => matchesPeriod(bill.billingMonth)).reduce((total, bill) => total + bill.billAmountPaise, 0);
  const monthlyElectricityPaidPaise = snapshot.electricity.filter(bill => matchesPeriod(bill.billingMonth)).reduce((total, bill) => total + bill.paidAmountPaise, 0);
  const monthlyElectricityPendingPaise = Math.max(monthlyElectricityBilledPaise - monthlyElectricityPaidPaise, 0);
  const [governmentElectricityRows, creditAdjustmentRows, ownerSettlementRows] = await Promise.all([
    db.select().from(governmentElectricityPayments).where(eq(governmentElectricityPayments.buildingId, buildingId)),
    db.select().from(managerCreditAdjustments).where(eq(managerCreditAdjustments.buildingId, buildingId)),
    db.select().from(ownerSettlements).where(eq(ownerSettlements.buildingId, buildingId)),
  ]);
  const governmentElectricity = governmentElectricityRows.filter(payment => matchesPeriod(payment.billingMonth));
  const governmentElectricityExpectedPaise = governmentElectricity.reduce((total, payment) => total + payment.expectedAmountPaise, 0);
  const governmentElectricityPaidPaise = governmentElectricity.reduce((total, payment) => total + payment.paidAmountPaise, 0);
  const governmentElectricityPendingPaise = Math.max(governmentElectricityExpectedPaise - governmentElectricityPaidPaise, 0);
  const ownerSettlementExpectedPaise = ownerSettlementRows.filter(settlement => matchesPeriod(settlement.billingMonth)).reduce((total, settlement) => total + settlement.expectedAmountPaise, 0);
  const ownerSettlementPaidPaise = ownerSettlementRows.filter(settlement => matchesPeriod(settlement.billingMonth)).reduce((total, settlement) => total + settlement.paidAmountPaise, 0);
  const electricityTenantCharges = snapshot.tenantCharges.filter(charge => charge.sourceType === "electricity" && charge.billingMonth !== null && matchesPeriod(charge.billingMonth));
  const electricityCollectionExpectedPaise = electricityTenantCharges.reduce((total, charge) => total + charge.expectedAmountPaise, 0);
  const electricityCollectionPaidPaise = electricityTenantCharges.reduce((total, charge) => total + charge.paidAmountPaise, 0);
  const electricityCollectionPendingPaise = Math.max(electricityCollectionExpectedPaise - electricityCollectionPaidPaise, 0);
  const periodTenantCharges = snapshot.tenantCharges.filter(charge => charge.sourceType !== "electricity" && charge.billingMonth !== null && matchesPeriod(charge.billingMonth));
  const periodTenantChargeExpectedPaise = periodTenantCharges.reduce((total, charge) => total + charge.expectedAmountPaise, 0);
  const periodTenantChargeCreditPaise = periodTenantCharges.reduce((total, charge) => total + charge.paidAmountPaise, 0);
  const periodTenantChargePendingPaise = periodTenantCharges.reduce((total, charge) => total + Math.max(charge.expectedAmountPaise - charge.paidAmountPaise, 0), 0);
  const totalTenantCreditPendingPaise = pendingPaise + electricityCollectionPendingPaise + periodTenantChargePendingPaise;
  const tenantCreditById = new Map<number, { tenantId: number; tenantName: string; tenantPhone: string; roomNumber: string; rentPendingPaise: number; electricityPendingPaise: number; assignedCostPendingPaise: number; earliestDueDate: string | null; paymentTarget: { type: "rent" | "tenantCharge"; recordId: number; dueDate: string | null } | null }>();
  const addTenantCredit = (tenantId: number, category: "rent" | "electricity" | "assignedCost", amountPaise: number, dueDate: string | null, paymentTarget: { type: "rent" | "tenantCharge"; recordId: number }) => {
    if (amountPaise <= 0) return;
    const tenant = tenantById.get(tenantId);
    if (!tenant) return;
    const allocation = activeAllocationByTenantId.get(tenantId);
    const current = tenantCreditById.get(tenantId) ?? { tenantId, tenantName: tenant.fullName, tenantPhone: tenant.phone, roomNumber: allocation ? roomById.get(allocation.roomId)?.number ?? "—" : "—", rentPendingPaise: 0, electricityPendingPaise: 0, assignedCostPendingPaise: 0, earliestDueDate: null, paymentTarget: null };
    if (category === "rent") current.rentPendingPaise += amountPaise;
    if (category === "electricity") current.electricityPendingPaise += amountPaise;
    if (category === "assignedCost") current.assignedCostPendingPaise += amountPaise;
    if (dueDate && (!current.earliestDueDate || dueDate < current.earliestDueDate)) current.earliestDueDate = dueDate;
    if (!current.paymentTarget || (dueDate ?? "9999-12-31") < (current.paymentTarget.dueDate ?? "9999-12-31")) current.paymentTarget = { ...paymentTarget, dueDate };
    tenantCreditById.set(tenantId, current);
  };
  monthlyRents.forEach(rent => addTenantCredit(rent.tenantId, "rent", Math.max(rent.expectedAmountPaise - rent.paidAmountPaise, 0), rent.dueDate, { type: "rent", recordId: rent.id }));
  electricityTenantCharges.forEach(charge => addTenantCredit(charge.tenantId, "electricity", Math.max(charge.expectedAmountPaise - charge.paidAmountPaise, 0), charge.dueDate, { type: "tenantCharge", recordId: charge.id }));
  periodTenantCharges.forEach(charge => addTenantCredit(charge.tenantId, "assignedCost", Math.max(charge.expectedAmountPaise - charge.paidAmountPaise, 0), charge.dueDate, { type: "tenantCharge", recordId: charge.id }));
  const tenantCreditRows = Array.from(tenantCreditById.values()).map(row => ({ ...row, totalPendingPaise: row.rentPendingPaise + row.electricityPendingPaise + row.assignedCostPendingPaise, overdueDays: row.earliestDueDate && row.earliestDueDate < today ? Math.floor((Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${row.earliestDueDate}T00:00:00.000Z`)) / 86_400_000) : 0 })).filter(row => row.totalPendingPaise > 0).sort((left, right) => right.totalPendingPaise - left.totalPendingPaise || left.tenantName.localeCompare(right.tenantName));
  const cashFinancials = calculateBuildingFinancials({ expectedRentPaise, collectedRentPaise: collectedPaise, monthlyExpensePaise: monthlyExpensePaise + monthlyOperatingCostPaidPaise + governmentElectricityPaidPaise, monthlyServiceChargeExpectedPaise: monthlyServiceChargePaise, collectedTenantChargeRecoveryPaise: periodTenantChargeCreditPaise + electricityCollectionPaidPaise, ownerSettlementPaidPaise });
  const financials = calculateBuildingFinancials({ expectedRentPaise, collectedRentPaise: collectedPaise, monthlyExpensePaise: monthlyExpensePaise + monthlyOperatingCostPaise + governmentElectricityExpectedPaise, monthlyServiceChargeExpectedPaise: monthlyServiceChargePaise, expectedTenantChargeRecoveryPaise: periodTenantChargeExpectedPaise + electricityCollectionExpectedPaise });
  const legacyOwnerCutPaise = calculateManagerOperatingResult(financials.projectedOperatingResultPaise, building.ownerCutPercent).ownerCutPaise;
  const ownerCutPaise = building.ownerMonthlyCutPaise > 0 ? building.ownerMonthlyCutPaise : legacyOwnerCutPaise;
  const managerCreditAdjustmentPaise = creditAdjustmentRows.filter(adjustment => matchesPeriod(adjustment.billingMonth)).reduce((total, adjustment) => total + adjustment.amountPaise, 0);
  const managerOperatingResultPaise = financials.projectedOperatingResultPaise - ownerCutPaise + managerCreditAdjustmentPaise;
  const overdueRents = snapshot.rents.filter(rent => rent.status !== "paid" && rent.dueDate < today);
  const openReminders = snapshot.reminders.filter(reminder => reminder.status === "active");
  const insights: Array<{ id: string; severity: "urgent" | "attention" | "positive"; title: string; detail: string; path: string }> = [];
  if (pendingPaise > 0) insights.push({ id: "rent-pending", severity: overdueRents.length > 0 ? "urgent" : "attention", title: `${overdueRents.length > 0 ? overdueRents.length : ""}${overdueRents.length > 0 ? " overdue rent " : ""}collection${overdueRents.length === 1 ? "" : "s"} need follow-up`, detail: `${(pendingPaise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })} rent is pending for ${period.label}.`, path: "/billing" });
  if (monthlyElectricityPendingPaise > 0) insights.push({ id: "electricity-pending", severity: "attention", title: "Electricity collections remain open", detail: `${(monthlyElectricityPendingPaise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })} electricity is pending for ${period.label}.`, path: "/billing" });
  if (periodTenantChargePendingPaise > 0) insights.push({ id: "tenant-charge-pending", severity: "attention", title: "Assigned cost recoveries remain open", detail: `${(periodTenantChargePendingPaise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })} of shared or assigned costs is pending for ${period.label}.`, path: "/billing" });
  if (roomStates.some(room => room.availableBeds > 0)) insights.push({ id: "open-beds", severity: "positive", title: `${roomStates.reduce((total, room) => total + room.availableBeds, 0)} beds are ready to fill`, detail: "Review open beds and allocate the next tenant from the Rooms workspace.", path: "/rooms" });
  if (Math.max(monthlyOperatingCostPaise - monthlyOperatingCostPaidPaise, 0) > 0) insights.push({ id: "operating-payable", severity: "attention", title: "Operating payables need review", detail: `${(Math.max(monthlyOperatingCostPaise - monthlyOperatingCostPaidPaise, 0) / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })} remains payable in ${period.label}.`, path: "/expenses" });
  if (insights.length === 0) insights.push({ id: "on-track", severity: "positive", title: "Collections and costs are on track", detail: `No pending rent, electricity, or operating payables were recorded for ${period.label}.`, path: "/billing" });
  type MetricDetailItem = { id: string; title: string; detail: string; amountPaise: number; paymentTarget?: { type: "rent" | "electricity" | "tenantCharge"; recordId: number } };
  const rentItems = monthlyRents.map(rent => ({ id: `rent-${rent.id}`, title: tenantById.get(rent.tenantId)?.fullName ?? "Tenant", detail: `Rent ${rent.rentMonth} · ${rent.status}`, amountPaise: rent.expectedAmountPaise }));
  const rentCollectedItems = monthlyRents.filter(rent => rent.paidAmountPaise > 0).map(rent => ({ id: `rent-collected-${rent.id}`, title: tenantById.get(rent.tenantId)?.fullName ?? "Tenant", detail: `Rent ${rent.rentMonth} · ${rent.status}`, amountPaise: rent.paidAmountPaise }));
  const rentPendingItems = monthlyRents.filter(rent => rent.expectedAmountPaise > rent.paidAmountPaise).map(rent => ({ id: `rent-pending-${rent.id}`, title: tenantById.get(rent.tenantId)?.fullName ?? "Tenant", detail: `Due ${rent.dueDate} · ${rent.status}`, amountPaise: rent.expectedAmountPaise - rent.paidAmountPaise, paymentTarget: { type: "rent" as const, recordId: rent.id } }));
  const electricityItems = snapshot.electricity.filter(bill => matchesPeriod(bill.billingMonth)).map(bill => ({ id: `electricity-${bill.id}`, title: `Room ${roomById.get(bill.roomId)?.number ?? "—"}`, detail: `Electricity ${bill.billingMonth} · ${bill.status}`, amountPaise: bill.billAmountPaise }));
  const electricityCollectedItems = snapshot.electricity.filter(bill => matchesPeriod(bill.billingMonth) && bill.paidAmountPaise > 0).map(bill => ({ id: `electricity-collected-${bill.id}`, title: `Room ${roomById.get(bill.roomId)?.number ?? "—"}`, detail: `Electricity ${bill.billingMonth} · ${bill.status}`, amountPaise: bill.paidAmountPaise }));
  const electricityChargeIds = new Set(snapshot.tenantCharges.filter(charge => charge.sourceType === "electricity" && charge.billingMonth !== null && matchesPeriod(charge.billingMonth)).map(charge => charge.sourceId));
  const electricityPendingItems: MetricDetailItem[] = [
    ...snapshot.tenantCharges.filter(charge => charge.sourceType === "electricity" && charge.billingMonth !== null && matchesPeriod(charge.billingMonth) && charge.expectedAmountPaise > charge.paidAmountPaise).map(charge => ({ id: `electricity-charge-pending-${charge.id}`, title: tenantById.get(charge.tenantId ?? 0)?.fullName ?? charge.title, detail: `Room ${roomById.get(charge.roomId ?? 0)?.number ?? "—"} · Due ${charge.dueDate ?? "not set"}`, amountPaise: charge.expectedAmountPaise - charge.paidAmountPaise, paymentTarget: { type: "tenantCharge" as const, recordId: charge.id } })),
    ...snapshot.electricity.filter(bill => matchesPeriod(bill.billingMonth) && bill.billAmountPaise > bill.paidAmountPaise && !electricityChargeIds.has(bill.id)).map(bill => ({ id: `electricity-pending-${bill.id}`, title: `Room ${roomById.get(bill.roomId)?.number ?? "—"}`, detail: `Due ${bill.dueDate ?? "not set"} · ${bill.status}`, amountPaise: bill.billAmountPaise - bill.paidAmountPaise, paymentTarget: { type: "electricity" as const, recordId: bill.id } })),
  ];
  const expenseItems: MetricDetailItem[] = [
    ...snapshot.expenses.filter(expense => matchesPeriod(expense.expenseDate)).map(expense => ({ id: `expense-${expense.id}`, title: `${expense.category} expense`, detail: expense.expenseDate, amountPaise: expense.amountPaise })),
    ...snapshot.operatingCosts.filter(cost => matchesPeriod(cost.costDate)).map(cost => ({ id: `operating-cost-${cost.id}`, title: cost.title, detail: `${cost.costDate} · ${cost.status}`, amountPaise: cost.amountPaise })),
  ];
  const creditItems: MetricDetailItem[] = [
    ...rentPendingItems.map(item => ({ ...item, id: `credit-${item.id}`, detail: `Rent balance due · ${item.detail}` })),
    ...electricityPendingItems.map(item => ({ ...item, id: `credit-${item.id}`, detail: `Electricity balance due · ${item.detail}` })),
    ...periodTenantCharges.filter(charge => charge.expectedAmountPaise > charge.paidAmountPaise).map(charge => ({ id: `credit-charge-${charge.id}`, title: tenantById.get(charge.tenantId ?? 0)?.fullName ?? charge.title, detail: `Assigned cost balance due · ${charge.billingMonth}`, amountPaise: charge.expectedAmountPaise - charge.paidAmountPaise, paymentTarget: { type: "tenantCharge" as const, recordId: charge.id } })),
  ];
  const metricDetails: Record<string, { title: string; description: string; items: MetricDetailItem[] }> = {
    tenants: { title: "Tenant profiles", description: `All tenant profiles in ${building.name}.`, items: snapshot.tenants.map(tenant => { const allocation = activeAllocations.find(item => item.tenantId === tenant.id); return { id: `tenant-${tenant.id}`, title: tenant.fullName, detail: allocation ? `Room ${roomById.get(allocation.roomId)?.number ?? "—"} · active` : tenant.status, amountPaise: 0 }; }) },
    occupancy: { title: "Room occupancy", description: "Rooms with one or more active tenant allocations.", items: roomStates.filter(room => (roomById.get(room.roomId)?.capacity ?? 0) > room.availableBeds).map(room => { const capacity = roomById.get(room.roomId)?.capacity ?? 0; const filledBeds = Math.max(capacity - room.availableBeds, 0); return { id: `room-${room.roomId}`, title: `Room ${room.roomNumber}`, detail: `${filledBeds}/${capacity} beds filled · ${room.availableBeds} open`, amountPaise: 0 }; }) },
    rentExpected: { title: "Rent expected", description: `All rent dues recorded for ${period.label}.`, items: rentItems },
    rentCollected: { title: "Rent collected", description: `Recorded rent payments for ${period.label}.`, items: rentCollectedItems },
    rentPending: { title: "Rent pending", description: `Outstanding rent balances for ${period.label}.`, items: rentPendingItems },
    electricityBilled: { title: "Electricity billed", description: `Room electricity bills for ${period.label}.`, items: electricityItems },
    buildingElectricity: { title: "Total building electricity bill", description: `The building-level utility bill entered for ${period.label}, separate from room readings and tenant collections.`, items: governmentElectricity.map(payment => ({ id: `building-electricity-${payment.id}`, title: `Building utility bill · ${payment.billingMonth}`, detail: `${payment.status} · Due ${payment.dueDate}`, amountPaise: payment.expectedAmountPaise })) },
    electricityPending: { title: "Electricity pending", description: `Outstanding electricity balances for ${period.label}.`, items: electricityPendingItems },
    credit: { title: "Tenant credit pending", description: `Only remaining tenant balances for ${period.label}. Fully settled bills do not create credit entries.`, items: creditItems },
    expenses: { title: "Expenses booked", description: `General expenses and operating costs recorded for ${period.label}.`, items: expenseItems },
    cashProfit: { title: "Cash profit breakdown", description: "Collected rent and recoveries less paid costs, government electricity payments, and recorded Owner settlements.", items: [{ id: "cash-rent", title: "Rent collected", detail: period.label, amountPaise: collectedPaise }, { id: "cash-electricity-recoveries", title: "Electricity collected from tenants", detail: period.label, amountPaise: electricityCollectionPaidPaise }, { id: "cash-recoveries", title: "Assigned cost recoveries collected", detail: period.label, amountPaise: periodTenantChargeCreditPaise }, { id: "cash-government-electricity", title: "Government electricity paid", detail: period.label, amountPaise: -governmentElectricityPaidPaise }, { id: "cash-owner-settlement", title: "Owner settlement paid", detail: period.label, amountPaise: -ownerSettlementPaidPaise }, { id: "cash-expenses", title: "Paid expenses", detail: period.label, amountPaise: -(monthlyExpensePaise + monthlyOperatingCostPaidPaise) }, { id: "cash-result", title: "Cash operating result", detail: period.label, amountPaise: cashFinancials.cashOperatingResultPaise }] },
    projectedProfit: { title: "Projected profit breakdown", description: "Expected rent, recoveries, booked costs, government electricity, the fixed Owner cut, and Manager result adjustments.", items: [{ id: "projected-rent", title: "Rent expected", detail: period.label, amountPaise: expectedRentPaise }, { id: "projected-services", title: "Recurring services expected", detail: period.label, amountPaise: monthlyServiceChargePaise + monthlyTenantServicePaise }, { id: "projected-electricity-recoveries", title: "Electricity expected from tenants", detail: period.label, amountPaise: electricityCollectionExpectedPaise }, { id: "projected-recoveries", title: "Assigned cost recoveries expected", detail: period.label, amountPaise: periodTenantChargeExpectedPaise }, { id: "projected-government-electricity", title: "Government electricity payable", detail: period.label, amountPaise: -governmentElectricityExpectedPaise }, { id: "projected-expenses", title: "Booked expenses", detail: period.label, amountPaise: -(monthlyExpensePaise + monthlyOperatingCostPaise) }, { id: "projected-result", title: "Projected operating result", detail: period.label, amountPaise: financials.projectedOperatingResultPaise }, { id: "owner-cut", title: "Owner monthly cut", detail: period.label, amountPaise: -ownerCutPaise }, { id: "manager-credit-adjustment", title: "Manager result adjustments", detail: period.label, amountPaise: managerCreditAdjustmentPaise }, { id: "manager-result", title: "Projected Manager result", detail: period.label, amountPaise: managerOperatingResultPaise }] },
  };
  const recentActivity = [
    ...snapshot.allocations.map(allocation => ({ id: `allocation-${allocation.id}`, kind: allocation.status === "active" ? "allocation" : "moveOut", title: allocation.status === "active" ? "Tenant allocated" : "Move-out recorded", detail: `Room ${roomById.get(allocation.roomId)?.number ?? "—"} · ${allocation.moveInDate}`, occurredAt: allocation.updatedAt.toISOString() })),
    ...snapshot.rents.map(rent => ({ id: `rent-${rent.id}`, kind: "rent", title: `Rent ${rent.status}`, detail: `${rent.rentMonth} · ₹${(rent.paidAmountPaise / 100).toLocaleString("en-IN")} recorded`, occurredAt: rent.updatedAt.toISOString() })),
    ...snapshot.expenses.map(expense => ({ id: `expense-${expense.id}`, kind: "expense", title: `${expense.category} expense recorded`, detail: `₹${(expense.amountPaise / 100).toLocaleString("en-IN")} · ${expense.expenseDate}`, occurredAt: expense.updatedAt.toISOString() })),
    ...snapshot.operatingCosts.map(cost => ({ id: `operating-cost-${cost.id}`, kind: "operatingCost", title: `${cost.kind} cost recorded`, detail: `${cost.title} · ₹${(cost.amountPaise / 100).toLocaleString("en-IN")} · ${cost.status}`, occurredAt: cost.updatedAt.toISOString() })),
    ...snapshot.reminders.map(reminder => ({ id: `reminder-${reminder.id}`, kind: "reminder", title: reminder.status === "active" ? "Reminder scheduled" : "Reminder completed", detail: `${reminder.title} · Due ${reminder.dueDate}`, occurredAt: reminder.updatedAt.toISOString() })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 6);
  return {
    summary: {
      periodMode,
      periodKey: period.key,
      periodLabel: period.label,
      totalBuildings,
      totalTenants: snapshot.tenants.length,
      totalRooms: snapshot.rooms.length,
      occupiedRooms: roomStates.filter(room => room.status === "occupied").length,
      filledRooms: roomStates.filter(room => room.status === "occupied").length,
      vacantRooms: roomStates.filter(room => room.status === "vacant").length,
      vacantBeds: roomStates.reduce((total, room) => total + room.availableBeds, 0),
      collectedPaise,
      expectedRentPaise,
      pendingPaise,
      monthlyExpensePaise,
      monthlyOperatingCostPaise,
      monthlyOperatingCostPaidPaise,
      monthlyOperatingCostPayablePaise: Math.max(monthlyOperatingCostPaise - monthlyOperatingCostPaidPaise, 0),
      cashOperatingResultPaise: cashFinancials.cashOperatingResultPaise,
      projectedOperatingResultPaise: financials.projectedOperatingResultPaise,
      ownerCutPercent: building.ownerCutPercent,
      ownerMonthlyCutPaise: building.ownerMonthlyCutPaise,
      ownerCutPaise,
      ownerSettlementExpectedPaise,
      ownerSettlementPaidPaise,
      managerOperatingResultPaise,
      managerCreditAdjustmentPaise,
      monthlyServiceChargePaise,
      monthlyTenantServicePaise,
      monthlyElectricityBilledPaise,
      monthlyElectricityPaidPaise,
      monthlyElectricityPendingPaise,
      electricityCollectionExpectedPaise,
      electricityCollectionPaidPaise,
      electricityCollectionPendingPaise,
      governmentElectricityExpectedPaise,
      governmentElectricityPaidPaise,
      governmentElectricityPendingPaise,
      periodTenantChargeExpectedPaise,
      periodTenantChargeCreditPaise,
      periodTenantChargePendingPaise,
      totalTenantCreditPendingPaise,
      totalExpensesBookedPaise: monthlyExpensePaise + monthlyOperatingCostPaise,
      totalExpensesPaidPaise: monthlyExpensePaise + monthlyOperatingCostPaidPaise,
      unreadNotifications: snapshot.managerNotifications.filter(notification => notification.status === "unread").length,
      activeTenants: activeAllocations.length,
    },
    roomStates,
    tenantCreditRows,
    overdueRents,
    openReminders,
    insights,
    metricDetails,
    recentExpenses: snapshot.expenses.slice(0, 5),
    recentActivity,
  };
}

function deriveOwnerSettlementStatus(expectedAmountPaise: number, paidAmountPaise: number) {
  if (!Number.isInteger(expectedAmountPaise) || expectedAmountPaise <= 0) throw new Error("Owner settlement amount must be a positive whole number of paise.");
  if (!Number.isInteger(paidAmountPaise) || paidAmountPaise < 0 || paidAmountPaise > expectedAmountPaise) throw new Error("Owner settlement paid amount must be between zero and the expected amount.");
  return paidAmountPaise === 0 ? "pending" as const : paidAmountPaise === expectedAmountPaise ? "paid" as const : "partial" as const;
}

export async function upsertOwnerSettlement(input: { buildingId: number; billingMonth: string; expectedAmountPaise: number; paidAmountPaise: number; dueDate: string; paidOn: string | null; paymentMethod: "cash" | "upi" | "bank_transfer" | "cheque" | null; notes: string | null; receiptUrl: string | null; createdBy: number }) {
  const db = await requireDb();
  const status = deriveOwnerSettlementStatus(input.expectedAmountPaise, input.paidAmountPaise);
  const paidOn = input.paidAmountPaise > 0 ? input.paidOn ?? new Date().toISOString().slice(0, 10) : null;
  const paymentMethod = input.paidAmountPaise > 0 ? input.paymentMethod : null;
  await db.transaction(async tx => {
    await tx.insert(ownerSettlements).values({ ...input, status, paidOn, paymentMethod }).onConflictDoUpdate({
      target: [ownerSettlements.buildingId, ownerSettlements.billingMonth],
      set: { expectedAmountPaise: input.expectedAmountPaise, paidAmountPaise: input.paidAmountPaise, status, dueDate: input.dueDate, paidOn, paymentMethod, notes: input.notes, receiptUrl: input.receiptUrl, createdBy: input.createdBy },
    });
    await tx.update(buildings).set({ ownerMonthlyCutPaise: input.expectedAmountPaise, ownerCutPercent: 0 }).where(eq(buildings.id, input.buildingId));
  });
}

export async function confirmOwnerSettlement(input: { id: number; buildingId: number; ownerId: number }) {
  const db = await requireDb();
  await db.update(ownerSettlements).set({ ownerConfirmedAt: new Date(), ownerConfirmedBy: input.ownerId }).where(and(eq(ownerSettlements.id, input.id), eq(ownerSettlements.buildingId, input.buildingId)));
}

export async function deleteOwnerSettlement(input: { id: number; buildingId: number; createdBy: number }) {
  const db = await requireDb();
  return await db.transaction(async tx => {
    const settlement = (await tx.select().from(ownerSettlements).where(and(eq(ownerSettlements.id, input.id), eq(ownerSettlements.buildingId, input.buildingId))).limit(1))[0];
    if (!settlement) throw new Error("Owner settlement was not found in the selected building.");
    const [audit] = await tx.insert(changeAuditLogs).values({ buildingId: input.buildingId, entityType: "owner_settlement", entityId: input.id, action: "deleted", snapshotJson: JSON.stringify({ settlement }), createdBy: input.createdBy }).returning({ id: changeAuditLogs.id });
    if (!audit) throw new Error("Deletion audit could not be recorded.");
    await tx.delete(ownerSettlements).where(and(eq(ownerSettlements.id, input.id), eq(ownerSettlements.buildingId, input.buildingId)));
    return { auditId: audit.id };
  });
}

export async function upsertGovernmentElectricityPayment(input: { buildingId: number; billingMonth: string; expectedAmountPaise: number; paidAmountPaise: number; dueDate: string; paidOn: string | null; paymentMethod: "cash" | "upi" | "bank_transfer" | "cheque" | null; notes: string | null; receiptUrl: string | null; createdBy: number }) {
  const db = await requireDb();
  const status = deriveOwnerSettlementStatus(input.expectedAmountPaise, input.paidAmountPaise);
  const paidOn = input.paidAmountPaise > 0 ? input.paidOn ?? new Date().toISOString().slice(0, 10) : null;
  const paymentMethod = input.paidAmountPaise > 0 ? input.paymentMethod : null;
  await db.insert(governmentElectricityPayments).values({ ...input, status, paidOn, paymentMethod }).onConflictDoUpdate({
    target: [governmentElectricityPayments.buildingId, governmentElectricityPayments.billingMonth],
    set: { expectedAmountPaise: input.expectedAmountPaise, paidAmountPaise: input.paidAmountPaise, status, dueDate: input.dueDate, paidOn, paymentMethod, notes: input.notes, receiptUrl: input.receiptUrl, createdBy: input.createdBy },
  });
}

export async function deleteGovernmentElectricityPayment(input: { id: number; buildingId: number; createdBy: number }) {
  const db = await requireDb();
  return await db.transaction(async tx => {
    const payment = (await tx.select().from(governmentElectricityPayments).where(and(eq(governmentElectricityPayments.id, input.id), eq(governmentElectricityPayments.buildingId, input.buildingId))).limit(1))[0];
    if (!payment) throw new Error("Government electricity payment was not found in the selected building.");
    const [audit] = await tx.insert(changeAuditLogs).values({ buildingId: input.buildingId, entityType: "government_electricity_payment", entityId: input.id, action: "deleted", snapshotJson: JSON.stringify({ payment }), createdBy: input.createdBy }).returning({ id: changeAuditLogs.id });
    if (!audit) throw new Error("Deletion audit could not be recorded.");
    await tx.delete(governmentElectricityPayments).where(and(eq(governmentElectricityPayments.id, input.id), eq(governmentElectricityPayments.buildingId, input.buildingId)));
    return { auditId: audit.id };
  });
}

export async function createManagerCreditAdjustment(input: { buildingId: number; billingMonth: string; amountPaise: number; notes: string; createdBy: number }) {
  const db = await requireDb();
  await db.insert(managerCreditAdjustments).values(input);
}

export async function getManagerProfitWorkspace(input: { buildingId: number; totalBuildings: number; periodMode: "monthly" | "yearly"; periodKey?: string }) {
  const db = await requireDb();
  const overview = await getDashboardOverview(input.buildingId, input.totalBuildings, input.periodMode, input.periodKey);
  const [settlementRows, governmentElectricityRows, creditAdjustments] = await Promise.all([
    db.select().from(ownerSettlements).where(eq(ownerSettlements.buildingId, input.buildingId)).orderBy(desc(ownerSettlements.billingMonth)),
    db.select().from(governmentElectricityPayments).where(eq(governmentElectricityPayments.buildingId, input.buildingId)).orderBy(desc(governmentElectricityPayments.billingMonth)),
    db.select().from(managerCreditAdjustments).where(eq(managerCreditAdjustments.buildingId, input.buildingId)).orderBy(desc(managerCreditAdjustments.createdAt)),
  ]);
  const currentSettlement = settlementRows.find(settlement => settlement.billingMonth === overview.summary.periodKey) ?? null;
  const currentGovernmentElectricity = governmentElectricityRows.find(payment => payment.billingMonth === overview.summary.periodKey) ?? null;
  const expectedAmountPaise = currentSettlement?.expectedAmountPaise ?? overview.summary.ownerCutPaise;
  const paidAmountPaise = currentSettlement?.paidAmountPaise ?? 0;
  return {
    summary: overview.summary,
    ownerSettlement: { id: currentSettlement?.id ?? null, billingMonth: overview.summary.periodKey, expectedAmountPaise, paidAmountPaise, dueAmountPaise: Math.max(expectedAmountPaise - paidAmountPaise, 0), status: currentSettlement?.status ?? (expectedAmountPaise > 0 ? "pending" : "paid"), dueDate: currentSettlement?.dueDate ?? `${overview.summary.periodKey}-05` },
    settlementHistory: settlementRows,
    governmentElectricity: currentGovernmentElectricity ?? { billingMonth: overview.summary.periodKey, expectedAmountPaise: 0, paidAmountPaise: 0, dueDate: `${overview.summary.periodKey}-05`, status: "paid" as const, paidOn: null, paymentMethod: null, notes: null, receiptUrl: null },
    governmentElectricityHistory: governmentElectricityRows,
    managerCreditAdjustments: creditAdjustments,
  };
}

export async function getOwnerOverview(input: { buildingIds: number[]; periodMode: "monthly" | "yearly"; periodKey?: string }) {
  const db = await requireDb();
  const authorizedBuildingIds = new Set(input.buildingIds);
  const ownedBuildings = (await db.select().from(buildings).orderBy(buildings.name)).filter(building => authorizedBuildingIds.has(building.id));
  const buildingSummaries = await Promise.all(ownedBuildings.map(async building => {
    const overview = await getDashboardOverview(building.id, ownedBuildings.length, input.periodMode, input.periodKey);
    const [settlements, snapshot] = await Promise.all([
      db.select().from(ownerSettlements).where(eq(ownerSettlements.buildingId, building.id)).orderBy(desc(ownerSettlements.billingMonth)),
      getBuildingSnapshot(building.id),
    ]);
    const currentSettlement = settlements.find(settlement => settlement.billingMonth === overview.summary.periodKey) ?? null;
    const latestConfiguredSettlement = settlements.find(settlement => settlement.expectedAmountPaise > 0) ?? null;
    const monthlyProfitPaise = currentSettlement?.expectedAmountPaise ?? (building.ownerMonthlyCutPaise || latestConfiguredSettlement?.expectedAmountPaise || overview.summary.ownerCutPaise);
    const nextPendingSettlement = settlements.find(settlement => settlement.status !== "paid") ?? null;
    const [year, month] = overview.summary.periodKey.split("-").map(Number);
    const nextPeriodKey = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}`;
    const nextPayment = nextPendingSettlement ?? { id: 0, billingMonth: nextPeriodKey, expectedAmountPaise: monthlyProfitPaise, paidAmountPaise: 0, dueDate: getRentDueDate(nextPeriodKey, building.rentDueDay), status: monthlyProfitPaise > 0 ? "pending" as const : "paid" as const, paymentMethod: null, paidOn: null, notes: null };
    return {
      building: { id: building.id, name: building.name, address: building.address, city: building.city, landmark: building.landmark, contactPhone: building.contactPhone, imageUrl: building.imageUrl, mapUrl: building.mapUrl },
      occupancy: { totalRooms: overview.summary.totalRooms, vacantRooms: overview.summary.vacantRooms, activeTenants: overview.summary.activeTenants, rooms: snapshot.rooms.map(room => { const floor = snapshot.floors.find(item => item.id === room.floorId); const allocations = snapshot.allocations.filter(allocation => allocation.roomId === room.id && allocation.status === "active"); return { id: room.id, number: room.number, floor: floor?.name ?? "Unassigned floor", roomType: room.roomType, capacity: room.capacity, filledBeds: allocations.length, vacantBeds: Math.max(room.capacity - allocations.length, 0), status: allocations.length >= room.capacity ? "filled" as const : allocations.length === 0 ? "vacant" as const : "partially_filled" as const, tenants: allocations.map(allocation => { const tenant = snapshot.tenants.find(item => item.id === allocation.tenantId); return { id: allocation.tenantId, fullName: tenant?.fullName ?? "Tenant", phone: tenant?.phone ?? "—" }; }) }; }) },
      finance: { monthlyProfitPaise, monthlyBuildingExpensePaise: overview.summary.totalExpensesBookedPaise + overview.summary.governmentElectricityExpectedPaise, nextPayment },
      paymentHistory: settlements.filter(settlement => settlement.paidAmountPaise > 0).slice(0, 12),
    };
  }));
  return { periodMode: input.periodMode, periodKey: input.periodKey, buildings: buildingSummaries };
}

export async function getExportRows(input: { buildingId: number; exportType: "tenants" | "rent" | "electricity" | "expenses"; dateFrom?: string; dateTo?: string }) {
  const db = await requireDb();
  if (input.exportType === "tenants") {
    const conditions = [eq(tenants.buildingId, input.buildingId)];
    if (input.dateFrom) conditions.push(gte(tenants.createdAt, new Date(`${input.dateFrom}T00:00:00.000Z`)));
    if (input.dateTo) conditions.push(lte(tenants.createdAt, new Date(`${input.dateTo}T23:59:59.999Z`)));
    return db.select().from(tenants).where(and(...conditions));
  }
  if (input.exportType === "rent") {
    const conditions = [eq(rentPayments.buildingId, input.buildingId)];
    if (input.dateFrom) conditions.push(gte(rentPayments.dueDate, input.dateFrom));
    if (input.dateTo) conditions.push(lte(rentPayments.dueDate, input.dateTo));
    return db.select().from(rentPayments).where(and(...conditions));
  }
  if (input.exportType === "electricity") {
    const conditions = [eq(electricityBills.buildingId, input.buildingId)];
    const { fromMonth, toMonth } = exportMonthBounds(input);
    if (fromMonth) conditions.push(gte(electricityBills.billingMonth, fromMonth));
    if (toMonth) conditions.push(lte(electricityBills.billingMonth, toMonth));
    return db.select().from(electricityBills).where(and(...conditions));
  }
  const conditions = [eq(expenses.buildingId, input.buildingId)];
  if (input.dateFrom) conditions.push(gte(expenses.expenseDate, input.dateFrom));
  if (input.dateTo) conditions.push(lte(expenses.expenseDate, input.dateTo));
  return db.select().from(expenses).where(and(...conditions));
}

export async function recordExport(input: { buildingId: number; requestedBy: number; exportType: "tenants" | "rent" | "electricity" | "expenses" | "selected" | "complete"; dateFrom: string | null; dateTo: string | null }) {
  const db = await requireDb();
  await db.insert(exportHistory).values(input);
}

export async function getUsers() {
  const db = await requireDb();
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, lastSignedIn: users.lastSignedIn }).from(users).where(ne(users.role, "tenant")).orderBy(desc(users.lastSignedIn));
}

export async function createOrLinkBuildingOwner(input: { name: string; phone: string; passwordHash?: string }) {
  const db = await requireDb();
  const existing = (await db.select().from(users).where(eq(users.phone, input.phone)).limit(1))[0];
  if (existing) {
    if (existing.role !== "admin") throw new Error("This phone number belongs to a non-Owner account. Use a registered Owner phone or create a new Owner profile.");
    return existing.id;
  }
  if (!input.passwordHash) throw new Error("Set an initial password when creating a new Owner profile.");
  const [result] = await db.insert(users).values({ openId: `owner-${input.phone}-${Date.now()}`, name: input.name, phone: input.phone, passwordHash: input.passwordHash, loginMethod: "phone-password", role: "admin" }).returning({ id: users.id });
  if (!result) throw new Error("Owner account could not be created.");
  return result.id;
}

export async function updateOwnCredentials(input: { userId: number; phone: string; passwordHash: string | null }) {
  const db = await requireDb();
  const current = (await db.select({ id: users.id, phone: users.phone, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
  if (!current) throw new Error("Account was not found.");
  const matchingPhone = (await db.select({ id: users.id }).from(users).where(eq(users.phone, input.phone)).limit(1))[0];
  if (matchingPhone && matchingPhone.id !== input.userId) throw new Error("That phone number is already used by another account.");
  await db.transaction(async tx => {
    await tx.update(users).set({ phone: input.phone, ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}), loginMethod: "phone-password" }).where(eq(users.id, input.userId));
    await tx.insert(changeAuditLogs).values({ buildingId: null, entityType: "user_account", entityId: input.userId, action: "credentials_updated", snapshotJson: JSON.stringify({ role: current.role, phoneBefore: current.phone, phoneAfter: input.phone, passwordChanged: Boolean(input.passwordHash) }), createdBy: input.userId });
  });
}

export async function listBuildingRecoveryAccounts(buildingId: number) {
  const db = await requireDb();
  const building = (await db.select({ ownerId: buildings.ownerId }).from(buildings).where(eq(buildings.id, buildingId)).limit(1))[0];
  if (!building) throw new Error("Building was not found.");
  const [ownerRows, managerRows, tenantRows] = await Promise.all([
    db.select({ id: users.id, name: users.name, phone: users.phone, role: users.role, lastSignedIn: users.lastSignedIn }).from(users).where(eq(users.id, building.ownerId)).limit(1),
    db.select({ id: users.id, name: users.name, phone: users.phone, role: users.role, lastSignedIn: users.lastSignedIn }).from(staffAssignments).innerJoin(users, eq(users.id, staffAssignments.userId)).where(and(eq(staffAssignments.buildingId, buildingId), eq(users.role, "manager"))),
    db.select({ id: users.id, name: users.name, phone: users.phone, role: users.role, lastSignedIn: users.lastSignedIn }).from(tenants).innerJoin(users, eq(users.id, tenants.userId)).where(eq(tenants.buildingId, buildingId)),
  ]);
  return [...ownerRows, ...managerRows, ...tenantRows].map(account => ({ ...account, name: account.name ?? "Unnamed account" }));
}

export async function resetBuildingAccountCredentials(input: { buildingId: number; userId: number; passwordHash: string; createdBy: number }) {
  const db = await requireDb();
  const building = (await db.select({ ownerId: buildings.ownerId }).from(buildings).where(eq(buildings.id, input.buildingId)).limit(1))[0];
  if (!building) throw new Error("Building was not found.");
  const [account, managerAssignment, tenant] = await Promise.all([
    db.select({ id: users.id, role: users.role, phone: users.phone }).from(users).where(eq(users.id, input.userId)).limit(1),
    db.select({ userId: staffAssignments.userId }).from(staffAssignments).where(and(eq(staffAssignments.buildingId, input.buildingId), eq(staffAssignments.userId, input.userId))).limit(1),
    db.select({ userId: tenants.userId }).from(tenants).where(and(eq(tenants.buildingId, input.buildingId), eq(tenants.userId, input.userId))).limit(1),
  ]);
  if (!account[0] || (account[0].id !== building.ownerId && !managerAssignment[0] && !tenant[0])) throw new Error("This account is not linked to the selected building.");
  await db.transaction(async tx => {
    await tx.update(users).set({ passwordHash: input.passwordHash, loginMethod: "phone-password" }).where(eq(users.id, input.userId));
    await tx.insert(changeAuditLogs).values({ buildingId: input.buildingId, entityType: "user_account", entityId: input.userId, action: "password_reset_by_manager", snapshotJson: JSON.stringify({ role: account[0].role, phone: account[0].phone }), createdBy: input.createdBy });
  });
}

export async function getTenantPortal(userId: number) {
  const db = await requireDb();
  const tenant = (await db.select().from(tenants).where(eq(tenants.userId, userId)).limit(1))[0];
  if (!tenant) return undefined;
  const allocation = (await db.select().from(roomAllocations).where(and(eq(roomAllocations.tenantId, tenant.id), eq(roomAllocations.status, "active"))).limit(1))[0];
  const building = (await db.select().from(buildings).where(eq(buildings.id, tenant.buildingId)).limit(1))[0];
  const room = allocation ? (await db.select().from(rooms).where(eq(rooms.id, allocation.roomId)).limit(1))[0] : undefined;
  const rents = await db.select().from(rentPayments).where(eq(rentPayments.tenantId, tenant.id)).orderBy(desc(rentPayments.rentMonth));
  const electricity = room ? await db.select().from(electricityBills).where(eq(electricityBills.roomId, room.id)).orderBy(desc(electricityBills.billingMonth)) : [];
  const charges = await db.select().from(tenantCharges).where(eq(tenantCharges.tenantId, tenant.id)).orderBy(desc(tenantCharges.createdAt));
  const tenantReminders = await db.select().from(reminders).where(and(eq(reminders.tenantId, tenant.id), eq(reminders.status, "active"))).orderBy(reminders.dueDate);
  return { tenant, allocation, building, room, rents, electricity, charges, reminders: tenantReminders };
}

export async function createTenantSupportRequest(input: { userId: number; category: "maintenance" | "payment" | "room" | "other"; description: string }) {
  const db = await requireDb();
  const tenant = (await db.select({ id: tenants.id, buildingId: tenants.buildingId }).from(tenants).where(eq(tenants.userId, input.userId)).limit(1))[0];
  if (!tenant) throw new Error("Tenant profile is not linked to this login.");
  const categoryLabel = input.category === "room" ? "Room" : input.category.charAt(0).toUpperCase() + input.category.slice(1);
  await db.insert(reminders).values({ buildingId: tenant.buildingId, tenantId: tenant.id, rentPaymentId: null, title: `Tenant request · ${categoryLabel}: ${input.description}`, dueDate: new Date().toISOString().slice(0, 10), createdBy: input.userId });
  return { buildingId: tenant.buildingId, tenantId: tenant.id };
}

export async function submitTenantPaymentReceipt(input: { userId: number; type: "rent" | "electricity" | "tenant_charge"; billId: number; receiptUrl: string; paymentMethod: "cash" | "upi" | "bank_transfer" }) {
  const db = await requireDb();
  const tenant = (await db.select({ id: tenants.id, buildingId: tenants.buildingId }).from(tenants).where(eq(tenants.userId, input.userId)).limit(1))[0];
  if (!tenant) throw new Error("Tenant profile is not linked to this login.");

  if (input.type === "rent") {
    const payment = (await db.select({ id: rentPayments.id, rentMonth: rentPayments.rentMonth, dueDate: rentPayments.dueDate, status: rentPayments.status }).from(rentPayments).where(and(eq(rentPayments.id, input.billId), eq(rentPayments.tenantId, tenant.id), eq(rentPayments.buildingId, tenant.buildingId))).limit(1))[0];
    if (!payment) throw new Error("Rent record not found for this tenant.");
    await db.update(rentPayments).set({ receiptUrl: input.receiptUrl, paymentMethod: input.paymentMethod, receiptReviewStatus: "pending", receiptReviewedAt: null, receiptReviewedBy: null, receiptReviewNote: null }).where(eq(rentPayments.id, payment.id));
    await syncRentPaymentReminder({ id: payment.id, buildingId: tenant.buildingId, tenantId: tenant.id, rentMonth: payment.rentMonth, dueDate: payment.dueDate, status: payment.status, createdBy: input.userId });
    return { success: true as const, label: `Rent ${payment.rentMonth}` };
  }

  if (input.type === "tenant_charge") {
    const charge = (await db.select({ id: tenantCharges.id, title: tenantCharges.title }).from(tenantCharges).where(and(eq(tenantCharges.id, input.billId), eq(tenantCharges.tenantId, tenant.id), eq(tenantCharges.buildingId, tenant.buildingId))).limit(1))[0];
    if (!charge) throw new Error("Tenant charge not found for this account.");
    await db.update(tenantCharges).set({ receiptUrl: input.receiptUrl, paymentMethod: input.paymentMethod, receiptReviewStatus: "pending", receiptReviewedAt: null, receiptReviewedBy: null, receiptReviewNote: null }).where(eq(tenantCharges.id, charge.id));
    await db.insert(reminders).values({ buildingId: tenant.buildingId, tenantId: tenant.id, rentPaymentId: null, title: `Tenant payment receipt submitted · ${charge.title}`, dueDate: new Date().toISOString().slice(0, 10), createdBy: input.userId });
    return { success: true as const, label: charge.title };
  }

  const allocation = (await db.select({ roomId: roomAllocations.roomId }).from(roomAllocations).where(and(eq(roomAllocations.tenantId, tenant.id), eq(roomAllocations.status, "active"))).limit(1))[0];
  if (!allocation) throw new Error("An active room allocation is required to submit an electricity receipt.");
  const bill = (await db.select({ id: electricityBills.id, billingMonth: electricityBills.billingMonth }).from(electricityBills).where(and(eq(electricityBills.id, input.billId), eq(electricityBills.roomId, allocation.roomId), eq(electricityBills.buildingId, tenant.buildingId))).limit(1))[0];
  if (!bill) throw new Error("Electricity record not found for this tenant.");
  await db.update(electricityBills).set({ receiptUrl: input.receiptUrl, paymentMethod: input.paymentMethod, receiptReviewStatus: "pending", receiptReviewedAt: null, receiptReviewedBy: null, receiptReviewNote: null }).where(eq(electricityBills.id, bill.id));
  await db.insert(reminders).values({ buildingId: tenant.buildingId, tenantId: tenant.id, rentPaymentId: null, title: `Tenant payment receipt submitted · Electricity ${bill.billingMonth}`, dueDate: new Date().toISOString().slice(0, 10), createdBy: input.userId });
  return { success: true as const, label: `Electricity ${bill.billingMonth}` };
}

export async function reviewTenantPaymentReceipt(input: { type: "rent" | "electricity" | "tenant_charge"; billId: number; buildingId: number; expectedUpdatedAt: Date; status: "approved" | "rejected"; reviewNote: string | null; reviewedBy: number }) {
  const db = await requireDb();
  const set = { receiptReviewStatus: input.status, receiptReviewedAt: new Date(), receiptReviewedBy: input.reviewedBy, receiptReviewNote: input.reviewNote };
  let result;
  if (input.type === "rent") result = await db.update(rentPayments).set(set).where(and(eq(rentPayments.id, input.billId), eq(rentPayments.buildingId, input.buildingId), eq(rentPayments.updatedAt, input.expectedUpdatedAt))).returning({ id: rentPayments.id });
  else if (input.type === "electricity") result = await db.update(electricityBills).set(set).where(and(eq(electricityBills.id, input.billId), eq(electricityBills.buildingId, input.buildingId), eq(electricityBills.updatedAt, input.expectedUpdatedAt))).returning({ id: electricityBills.id });
  else result = await db.update(tenantCharges).set(set).where(and(eq(tenantCharges.id, input.billId), eq(tenantCharges.buildingId, input.buildingId), eq(tenantCharges.updatedAt, input.expectedUpdatedAt))).returning({ id: tenantCharges.id });
  if (result.length !== 1) throw new Error("This receipt changed on another device or is outside the selected building. Review the latest record before deciding.");
  return { status: input.status };
}

export async function updateUserRole(userId: number, role: "admin" | "manager" | "helper" | "cook") {
  const db = await requireDb();
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function createStaffUser(input: { buildingId: number; name: string; phone: string; passwordHash: string; role: "helper" | "cook" }) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const [result] = await tx.insert(users).values({
      openId: `staff-${input.phone}-${Date.now()}`,
      name: input.name,
      phone: input.phone,
      passwordHash: input.passwordHash,
      loginMethod: "phone-password",
      role: input.role,
    }).returning({ id: users.id });
    if (!result) throw new Error("Staff account could not be created.");
    const userId = result.id;
    await tx.insert(staffAssignments).values({ buildingId: input.buildingId, userId });
    return { userId };
  });
}

export async function addStaffAssignment(input: { buildingId: number; userId: number }) {
  const db = await requireDb();
  await db.insert(staffAssignments).values(input).onConflictDoUpdate({ target: [staffAssignments.buildingId, staffAssignments.userId], set: { userId: input.userId } });
}
