import { eq, inArray } from "drizzle-orm";
import { buildings, changeAuditLogs, exportHistory, governmentElectricityPayments, managerCreditAdjustments, ownerSettlements, staffAssignments, users } from "../drizzle-pg/schema";
import { getBuildingSnapshot, getDb } from "./db";

export const workbookExportDatasets = ["building", "rooms", "tenants", "allocations", "rent", "electricity", "tenantCharges", "expenses", "operatingCosts", "services", "reminders", "transfers", "ownerSettlements", "buildingElectricity", "managerAdjustments", "accounts", "notifications", "auditLogs", "exportHistory"] as const;
export type WorkbookExportDataset = (typeof workbookExportDatasets)[number];
export type WorkbookExportMode = "selected" | "complete";
export type WorkbookPaymentStatus = "all" | "paid" | "pending" | "partial";

export type WorkbookExportInput = {
  buildingId: number;
  mode: WorkbookExportMode;
  datasets: WorkbookExportDataset[];
  dateFrom?: string;
  dateTo?: string;
  paymentStatus: WorkbookPaymentStatus;
  outstandingOnly: boolean;
  fieldSelections?: Record<string, string[]>;
};

type WorkbookRow = Record<string, string | number | boolean | null>;

const toDate = (value: Date | string | null | undefined) => value instanceof Date ? value.toISOString().slice(0, 10) : value ?? null;
const toDateTime = (value: Date | null | undefined) => value ? value.toISOString() : null;
const rupees = (paise: number | null | undefined) => Math.round((paise ?? 0)) / 100;
const remaining = (expected: number, paid: number) => Math.max(expected - paid, 0);

function matchesDate(value: Date | string | null | undefined, input: WorkbookExportInput) {
  if (!input.dateFrom && !input.dateTo) return true;
  const date = toDate(value);
  if (!date) return false;
  return (!input.dateFrom || date >= input.dateFrom) && (!input.dateTo || date <= input.dateTo);
}

function matchesFinancialRecord(input: WorkbookExportInput, value: Date | string | null | undefined, status: string, expected: number, paid: number) {
  if (input.mode === "complete") return true;
  if (!matchesDate(value, input)) return false;
  if (input.paymentStatus !== "all" && status !== input.paymentStatus) return false;
  return !input.outstandingOnly || remaining(expected, paid) > 0;
}

function sanitizeSheetName(name: string) {
  return name.replace(/[\\/?*\[\]:]/g, " ").slice(0, 31) || "Export";
}

function selectWorkbookFields(dataset: WorkbookExportDataset, rows: WorkbookRow[], input: WorkbookExportInput) {
  if (input.mode !== "selected" || !input.fieldSelections || !(dataset in input.fieldSelections)) return rows;
  const selected = new Set(input.fieldSelections[dataset]);
  return rows.map(row => Object.fromEntries(Object.entries(row).filter(([field]) => selected.has(field))));
}

export async function getWorkbookExportData(input: WorkbookExportInput) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is unavailable.");

  const building = (await db.select({
    id: buildings.id,
    name: buildings.name,
    address: buildings.address,
    city: buildings.city,
    landmark: buildings.landmark,
    contactPhone: buildings.contactPhone,
    electricityRatePaise: buildings.electricityRatePaise,
    rentDueDay: buildings.rentDueDay,
    currency: buildings.currency,
    ownerMonthlyCutPaise: buildings.ownerMonthlyCutPaise,
    ownerId: buildings.ownerId,
    createdAt: buildings.createdAt,
    updatedAt: buildings.updatedAt,
  }).from(buildings).where(eq(buildings.id, input.buildingId)).limit(1))[0];
  if (!building) throw new Error("Selected building was not found.");

  const snapshot = await getBuildingSnapshot(input.buildingId);
  const [ownerRows, utilityRows, creditAdjustmentRows, staffRows, auditRows, historyRows] = await Promise.all([
    db.select().from(ownerSettlements).where(eq(ownerSettlements.buildingId, input.buildingId)),
    db.select().from(governmentElectricityPayments).where(eq(governmentElectricityPayments.buildingId, input.buildingId)),
    db.select().from(managerCreditAdjustments).where(eq(managerCreditAdjustments.buildingId, input.buildingId)),
    db.select().from(staffAssignments).where(eq(staffAssignments.buildingId, input.buildingId)),
    db.select().from(changeAuditLogs).where(eq(changeAuditLogs.buildingId, input.buildingId)),
    db.select().from(exportHistory).where(eq(exportHistory.buildingId, input.buildingId)),
  ]);

  const accountIds = Array.from(new Set([building.ownerId, ...staffRows.map(row => row.userId), ...snapshot.tenants.map(tenant => tenant.userId).filter((id): id is number => id !== null)]));
  const accountRows = accountIds.length === 0 ? [] : await db.select({
    accountId: users.id,
    name: users.name,
    loginPhone: users.phone,
    role: users.role,
    loginMethod: users.loginMethod,
    lastSignedIn: users.lastSignedIn,
    createdAt: users.createdAt,
  }).from(users).where(inArray(users.id, accountIds));

  const roomById = new Map(snapshot.rooms.map(room => [room.id, room]));
  const floorById = new Map(snapshot.floors.map(floor => [floor.id, floor]));
  const tenantById = new Map(snapshot.tenants.map(tenant => [tenant.id, tenant]));
  const allocationById = new Map(snapshot.allocations.map(allocation => [allocation.id, allocation]));
  const include = (dataset: WorkbookExportDataset) => input.mode === "complete" || input.datasets.includes(dataset);
  const sheets: Array<{ name: string; rows: WorkbookRow[] }> = [];
  const append = (name: WorkbookExportDataset, rows: WorkbookRow[]) => { if (include(name)) sheets.push({ name: sanitizeSheetName(name), rows: selectWorkbookFields(name, rows, input) }); };

  sheets.push({ name: "Export summary", rows: [
    { Field: "Building", Value: building.name },
    { Field: "Export mode", Value: input.mode === "complete" ? "Complete operational export" : "Selected data export" },
    { Field: "Generated at UTC", Value: new Date().toISOString() },
    { Field: "Date from", Value: input.dateFrom ?? "All dates" },
    { Field: "Date to", Value: input.dateTo ?? "All dates" },
    { Field: "Payment status", Value: input.paymentStatus },
    { Field: "Outstanding balances only", Value: input.outstandingOnly },
    { Field: "Security exclusion", Value: "Passwords, password hashes, database credentials, session data, and secrets are never exported." },
  ] });

  append("building", [{
    Building: building.name,
    Address: building.address,
    City: building.city,
    Landmark: building.landmark,
    "Manager contact phone": building.contactPhone,
    "Electricity rate (₹/unit)": rupees(building.electricityRatePaise),
    "Rent due day": building.rentDueDay,
    Currency: building.currency,
    "Fixed Owner cut (₹)": rupees(building.ownerMonthlyCutPaise),
    "Created at": toDateTime(building.createdAt),
    "Updated at": toDateTime(building.updatedAt),
  }]);
  append("rooms", snapshot.rooms.map(room => ({
    "Room number": room.number,
    Floor: floorById.get(room.floorId ?? 0)?.name ?? null,
    Capacity: room.capacity,
    "Room type": room.roomType,
    "Billing mode": room.billingMode,
    "Air conditioning": room.airConditioning,
    Balcony: room.balcony,
    "Default rent (₹)": rupees(room.defaultRentPaise),
    "Created at": toDateTime(room.createdAt),
    "Updated at": toDateTime(room.updatedAt),
  })));
  append("tenants", snapshot.tenants.filter(tenant => input.mode === "complete" || matchesDate(tenant.createdAt, input)).map(tenant => {
    const allocation = snapshot.allocations.find(item => item.tenantId === tenant.id && item.status === "active");
    return {
      "Tenant name": tenant.fullName,
      Phone: tenant.phone,
      Email: tenant.email,
      Status: tenant.status,
      "Active room": allocation ? roomById.get(allocation.roomId)?.number ?? null : null,
      "Agreed rent (₹)": allocation ? rupees(allocation.monthlyRentPaise) : null,
      "Move-in date": allocation?.moveInDate ?? null,
      "Created at": toDateTime(tenant.createdAt),
      "Updated at": toDateTime(tenant.updatedAt),
    };
  }));
  append("allocations", snapshot.allocations.filter(allocation => input.mode === "complete" || matchesDate(allocation.moveInDate, input)).map(allocation => ({
    "Tenant name": tenantById.get(allocation.tenantId)?.fullName ?? "Tenant",
    "Room number": roomById.get(allocation.roomId)?.number ?? "—",
    "Move-in date": allocation.moveInDate,
    "Move-out date": allocation.moveOutDate,
    Bed: allocation.bedLabel,
    "Primary payer": allocation.isPrimaryPayer,
    "Monthly rent (₹)": rupees(allocation.monthlyRentPaise),
    "Deposit (₹)": rupees(allocation.depositPaise),
    Status: allocation.status,
  })));
  append("rent", snapshot.rents.filter(rent => matchesFinancialRecord(input, rent.dueDate, rent.status, rent.expectedAmountPaise, rent.paidAmountPaise)).map(rent => ({
    "Tenant name": tenantById.get(rent.tenantId)?.fullName ?? "Tenant",
    "Room number": roomById.get(allocationById.get(rent.allocationId)?.roomId ?? 0)?.number ?? "—",
    Month: rent.rentMonth,
    "Due date": rent.dueDate,
    "Bill amount (₹)": rupees(rent.expectedAmountPaise),
    "Paid amount (₹)": rupees(rent.paidAmountPaise),
    "Balance due (₹)": rupees(remaining(rent.expectedAmountPaise, rent.paidAmountPaise)),
    Status: rent.status,
    "Paid on": rent.paidOn,
    "Payment method": rent.paymentMethod,
    Notes: rent.notes,
  })));
  append("electricity", snapshot.electricity.filter(bill => matchesFinancialRecord(input, `${bill.billingMonth}-01`, bill.status, bill.billAmountPaise, bill.paidAmountPaise)).map(bill => ({
    "Room number": roomById.get(bill.roomId)?.number ?? "—",
    Month: bill.billingMonth,
    "Previous reading": bill.previousReading,
    "Current reading": bill.currentReading,
    Units: bill.unitsConsumed,
    "Rate (₹/unit)": rupees(bill.ratePerUnitPaise),
    "Bill amount (₹)": rupees(bill.billAmountPaise),
    "Paid amount (₹)": rupees(bill.paidAmountPaise),
    "Balance due (₹)": rupees(remaining(bill.billAmountPaise, bill.paidAmountPaise)),
    Status: bill.status,
    "Due date": bill.dueDate,
    "Paid on": bill.paidOn,
    "Payment method": bill.paymentMethod,
  })));
  append("tenantCharges", snapshot.tenantCharges.filter(charge => matchesFinancialRecord(input, charge.dueDate ?? (charge.billingMonth ? `${charge.billingMonth}-01` : null), charge.status, charge.expectedAmountPaise, charge.paidAmountPaise)).map(charge => ({
    "Tenant name": tenantById.get(charge.tenantId)?.fullName ?? "Tenant",
    "Room number": roomById.get(charge.roomId ?? 0)?.number ?? null,
    Source: charge.sourceType,
    Title: charge.title,
    Month: charge.billingMonth,
    "Bill amount (₹)": rupees(charge.expectedAmountPaise),
    "Paid amount (₹)": rupees(charge.paidAmountPaise),
    "Balance due (₹)": rupees(remaining(charge.expectedAmountPaise, charge.paidAmountPaise)),
    Status: charge.status,
    "Due date": charge.dueDate,
    "Paid on": charge.paidOn,
    "Payment method": charge.paymentMethod,
  })));
  append("expenses", snapshot.expenses.filter(expense => input.mode === "complete" || matchesDate(expense.expenseDate, input)).map(expense => ({
    Date: expense.expenseDate,
    Category: expense.category,
    "Liability mode": expense.liabilityMode,
    "Room number": roomById.get(expense.roomId ?? 0)?.number ?? null,
    "Tenant name": tenantById.get(expense.tenantId ?? 0)?.fullName ?? null,
    "Amount (₹)": rupees(expense.amountPaise),
    Notes: expense.notes,
  })));
  append("operatingCosts", snapshot.operatingCosts.filter(cost => input.mode === "complete" || matchesDate(cost.costDate, input)).map(cost => ({
    Date: cost.costDate,
    Type: cost.kind,
    Category: cost.category,
    Title: cost.title,
    Payee: cost.payeeName,
    Vendor: cost.vendorName,
    "Liability mode": cost.liabilityMode,
    "Room number": roomById.get(cost.roomId ?? 0)?.number ?? null,
    "Tenant name": tenantById.get(cost.tenantId ?? 0)?.fullName ?? null,
    "Amount (₹)": rupees(cost.amountPaise),
    "Paid amount (₹)": rupees(cost.paidAmountPaise),
    "Balance due (₹)": rupees(remaining(cost.amountPaise, cost.paidAmountPaise)),
    "Payment status": cost.status,
    "Work status": cost.workStatus,
    "Due date": cost.dueDate,
  })));
  append("services", [
    ...snapshot.serviceCharges.map(charge => ({ Type: "Building service", Name: charge.name, "Billing cycle": charge.billingCycle, "Amount (₹)": rupees(charge.amountPaise), "Due day": charge.dueDay, Status: charge.active, "Tenant name": null, Notes: charge.notes })),
    ...snapshot.tenantServices.map(service => ({ Type: "Tenant service", Name: service.serviceType, "Billing cycle": "monthly", "Amount (₹)": rupees(service.monthlyChargePaise), "Due day": null, Status: service.active, "Tenant name": tenantById.get(service.tenantId)?.fullName ?? "Tenant", Notes: service.notes })),
  ]);
  append("reminders", snapshot.reminders.filter(reminder => input.mode === "complete" || matchesDate(reminder.dueDate, input)).map(reminder => ({
    Title: reminder.title,
    "Tenant name": tenantById.get(reminder.tenantId ?? 0)?.fullName ?? null,
    "Due date": reminder.dueDate,
    Status: reminder.status,
    "Delivery requested at": toDateTime(reminder.deliveryRequestedAt),
    "Notified at": toDateTime(reminder.notifiedAt),
  })));
  append("transfers", snapshot.tenantTransfers.filter(transfer => input.mode === "complete" || matchesDate(transfer.effectiveDate, input)).map(transfer => ({
    "Tenant name": tenantById.get(transfer.tenantId)?.fullName ?? "Tenant",
    "Source room": roomById.get(transfer.sourceRoomId)?.number ?? "—",
    "Destination room": roomById.get(transfer.destinationRoomId)?.number ?? "—",
    "Effective date": transfer.effectiveDate,
    "Source rent (₹)": rupees(transfer.sourceMonthlyRentPaise),
    "Destination rent (₹)": rupees(transfer.destinationMonthlyRentPaise),
    "Proration applied": transfer.prorationApplied,
    "Source prorated amount (₹)": transfer.sourceProratedAmountPaise === null ? null : rupees(transfer.sourceProratedAmountPaise),
    "Destination prorated amount (₹)": transfer.destinationProratedAmountPaise === null ? null : rupees(transfer.destinationProratedAmountPaise),
  })));
  append("ownerSettlements", ownerRows.filter(row => matchesFinancialRecord(input, `${row.billingMonth}-01`, row.status, row.expectedAmountPaise, row.paidAmountPaise)).map(row => ({
    Month: row.billingMonth,
    "Expected amount (₹)": rupees(row.expectedAmountPaise),
    "Paid amount (₹)": rupees(row.paidAmountPaise),
    "Balance due (₹)": rupees(remaining(row.expectedAmountPaise, row.paidAmountPaise)),
    Status: row.status,
    "Due date": row.dueDate,
    "Paid on": row.paidOn,
    "Payment method": row.paymentMethod,
    "Owner confirmed at": toDateTime(row.ownerConfirmedAt),
  })));
  append("buildingElectricity", utilityRows.filter(row => matchesFinancialRecord(input, `${row.billingMonth}-01`, row.status, row.expectedAmountPaise, row.paidAmountPaise)).map(row => ({
    Month: row.billingMonth,
    "Expected amount (₹)": rupees(row.expectedAmountPaise),
    "Paid amount (₹)": rupees(row.paidAmountPaise),
    "Balance due (₹)": rupees(remaining(row.expectedAmountPaise, row.paidAmountPaise)),
    Status: row.status,
    "Due date": row.dueDate,
    "Paid on": row.paidOn,
    "Payment method": row.paymentMethod,
  })));
  append("accounts", accountRows.map(account => ({
    Name: account.name,
    "Login phone": account.loginPhone,
    Role: account.role,
    "Sign-in method": account.loginMethod,
    "Last signed in": toDateTime(account.lastSignedIn),
    "Account created": toDateTime(account.createdAt),
    "Password and secret data": "Not exported",
  })));
  append("notifications", snapshot.managerNotifications.filter(notification => input.mode === "complete" || matchesDate(notification.dueDate ?? notification.createdAt, input)).map(notification => ({
    Type: notification.kind,
    Title: notification.title,
    Detail: notification.body,
    "Due date": notification.dueDate,
    Status: notification.status,
    "Created at": toDateTime(notification.createdAt),
    "Read at": toDateTime(notification.readAt),
  })));

  append("managerAdjustments", creditAdjustmentRows.filter(row => input.mode === "complete" || matchesDate(`${row.billingMonth}-01`, input)).map(row => ({ Month: row.billingMonth, "Adjustment (₹)": rupees(row.amountPaise), Notes: row.notes, "Created at": toDateTime(row.createdAt) })));
  append("auditLogs", auditRows.filter(row => input.mode === "complete" || matchesDate(row.createdAt, input)).map(row => ({ "Logged at": toDateTime(row.createdAt), "Entity type": row.entityType, "Entity ID": row.entityId, Action: row.action, "Snapshot retained": Boolean(row.snapshotJson), "Password and secret data": "Not exported" })));
  append("exportHistory", historyRows.filter(row => input.mode === "complete" || matchesDate(row.createdAt, input)).map(row => ({ "Requested at": toDateTime(row.createdAt), "Export type": row.exportType, "Date from": row.dateFrom, "Date to": row.dateTo, "Security scope": "Building-scoped; no secrets" })));

  return { buildingName: building.name, mode: input.mode, generatedAt: new Date().toISOString(), sheets };
}

export async function getWorkbookExportPreview(input: Omit<WorkbookExportInput, "fieldSelections">) {
  const workbook = await getWorkbookExportData(input);
  return {
    buildingName: workbook.buildingName,
    sheets: workbook.sheets.filter(sheet => sheet.name !== "Export summary").map(sheet => ({
      dataset: sheet.name,
      fields: Array.from(new Set(sheet.rows.flatMap(row => Object.keys(row)))),
      sampleRows: sheet.rows.slice(0, 3),
      rowCount: sheet.rows.length,
    })),
  };
}

export async function getCsvExportData(input: { buildingId: number; dataset: "rooms" | "tenants"; dateFrom?: string; dateTo?: string }) {
  const workbook = await getWorkbookExportData({ buildingId: input.buildingId, mode: "selected", datasets: [input.dataset], dateFrom: input.dateFrom, dateTo: input.dateTo, paymentStatus: "all", outstandingOnly: false });
  const sheet = workbook.sheets.find(item => item.name === input.dataset);
  const rows = sheet?.rows ?? [];
  return { buildingName: workbook.buildingName, dataset: input.dataset, fields: Array.from(new Set(rows.flatMap(row => Object.keys(row)))), rows };
}
