import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("createdAt", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull();

export const userRole = pgEnum("user_role", ["admin", "manager", "helper", "cook", "tenant"]);
export const roomType = pgEnum("room_type", ["single", "double", "triple", "four", "individual", "coliving"]);
export const roomBillingMode = pgEnum("room_billing_mode", ["equal_split", "manager_set", "primary_payer"]);
export const airConditioning = pgEnum("air_conditioning", ["ac", "non_ac"]);
export const balcony = pgEnum("balcony", ["balcony", "non_balcony"]);
export const tenantStatus = pgEnum("tenant_status", ["active", "inactive"]);
export const allocationPrimaryPayer = pgEnum("allocation_primary_payer", ["no", "yes"]);
export const allocationStatus = pgEnum("allocation_status", ["active", "vacated"]);
export const rentStatus = pgEnum("rent_status", ["paid", "pending", "partial"]);
export const paymentMethod = pgEnum("payment_method", ["cash", "upi", "bank_transfer"]);
export const receiptReviewStatus = pgEnum("receipt_review_status", ["not_submitted", "pending", "approved", "rejected"]);
export const transferProrationStatus = pgEnum("transfer_proration_status", ["no", "yes"]);
export const expenseLiabilityMode = pgEnum("expense_liability_mode", ["building", "room_shared", "tenant_assigned"]);
export const expenseCategory = pgEnum("expense_category", ["maintenance", "groceries", "salaries", "utilities", "rent", "water", "labor", "tiffin", "other"]);
export const operatingCostLiabilityMode = pgEnum("operating_cost_liability_mode", ["building", "room_shared", "tenant_assigned"]);
export const operatingCostKind = pgEnum("operating_cost_kind", ["staff", "supplies", "maintenance"]);
export const operatingCostCategory = pgEnum("operating_cost_category", ["helper_salary", "cook_salary", "staff_advance", "staff_settlement", "groceries", "utensils", "gas", "cleaning", "water", "repair_electrician", "repair_plumber", "rent_equipment", "other"]);
export const operatingCostStatus = pgEnum("operating_cost_status", ["pending", "partial", "paid"]);
export const operatingWorkStatus = pgEnum("operating_work_status", ["open", "in_progress", "complete"]);
export const ownerSettlementPaymentMethod = pgEnum("owner_settlement_payment_method", ["cash", "upi", "bank_transfer", "cheque"]);
export const tenantChargeSourceType = pgEnum("tenant_charge_source_type", ["electricity", "expense", "operating_cost", "tenant_service"]);
export const billingCycle = pgEnum("billing_cycle", ["monthly", "one_time"]);
export const activeStatus = pgEnum("active_status", ["active", "inactive"]);
export const tenantServiceType = pgEnum("tenant_service_type", ["tiffin", "water_bottle", "other"]);
export const reminderStatus = pgEnum("reminder_status", ["active", "complete"]);
export const managerNotificationKind = pgEnum("manager_notification_kind", ["rent_cycle", "rent_upcoming", "rent_overdue", "electricity_upcoming", "electricity_overdue"]);
export const notificationStatus = pgEnum("notification_status", ["unread", "read"]);
export const exportType = pgEnum("export_type", ["tenants", "rent", "electricity", "expenses", "selected", "complete"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 20 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").notNull().default("helper"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

export const buildings = pgTable("buildings", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  address: text("address").notNull(),
  city: varchar("city", { length: 80 }),
  landmark: varchar("landmark", { length: 160 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  imageUrl: text("imageUrl"),
  mapUrl: text("mapUrl"),
  ownerCutPercent: integer("ownerCutPercent").notNull().default(0),
  ownerMonthlyCutPaise: integer("ownerMonthlyCutPaise").notNull().default(0),
  paymentBankName: varchar("paymentBankName", { length: 120 }),
  paymentAccountName: varchar("paymentAccountName", { length: 120 }),
  paymentAccountNumber: varchar("paymentAccountNumber", { length: 64 }),
  paymentIfsc: varchar("paymentIfsc", { length: 32 }),
  paymentUpiId: varchar("paymentUpiId", { length: 120 }),
  paymentQrUrl: text("paymentQrUrl"),
  electricityRatePaise: integer("electricityRatePaise").notNull().default(800),
  rentDueDay: integer("rentDueDay").notNull().default(5),
  currency: varchar("currency", { length: 3 }).notNull().default("INR"),
  ownerId: integer("ownerId").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const staffAssignments = pgTable("staffAssignments", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assignedAt", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("staff_assignment_unique").on(table.buildingId, table.userId),
  index("staff_assignment_user_idx").on(table.userId),
]);

export const floors = pgTable("floors", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  level: integer("level").notNull(),
  createdAt: createdAt(),
}, table => [
  uniqueIndex("floor_building_level_unique").on(table.buildingId, table.level),
  index("floor_building_idx").on(table.buildingId),
]);

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  floorId: integer("floorId").references(() => floors.id, { onDelete: "set null" }),
  number: varchar("number", { length: 32 }).notNull(),
  capacity: integer("capacity").notNull().default(1),
  roomType: roomType("roomType").notNull().default("single"),
  billingMode: roomBillingMode("roomBillingMode").notNull().default("equal_split"),
  airConditioning: airConditioning("airConditioning").notNull().default("non_ac"),
  balcony: balcony("balcony").notNull().default("non_balcony"),
  imageUrl: text("imageUrl"),
  defaultRentPaise: integer("defaultRentPaise").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("room_building_number_unique").on(table.buildingId, table.number),
  index("room_floor_idx").on(table.floorId),
]);

export const tenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  userId: integer("userId").references(() => users.id, { onDelete: "set null" }).unique(),
  fullName: varchar("fullName", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  email: varchar("email", { length: 320 }),
  emergencyContactName: varchar("emergencyContactName", { length: 120 }),
  emergencyContactPhone: varchar("emergencyContactPhone", { length: 32 }),
  address: text("address"),
  identityDocumentUrl: text("identityDocumentUrl"),
  status: tenantStatus("tenantStatus").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [index("tenant_building_idx").on(table.buildingId)]);

export const roomAllocations = pgTable("roomAllocations", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  roomId: integer("roomId").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  tenantId: integer("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  activeTenantId: integer("activeTenantId").references(() => tenants.id, { onDelete: "set null" }),
  moveInDate: date("moveInDate", { mode: "string" }).notNull(),
  moveOutDate: date("moveOutDate", { mode: "string" }),
  bedLabel: varchar("bedLabel", { length: 32 }),
  isPrimaryPayer: allocationPrimaryPayer("allocationPrimaryPayer").notNull().default("no"),
  monthlyRentPaise: integer("monthlyRentPaise").notNull(),
  depositPaise: integer("depositPaise").notNull().default(0),
  status: allocationStatus("allocationStatus").notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index("allocation_room_status_idx").on(table.roomId, table.status),
  index("allocation_tenant_status_idx").on(table.tenantId, table.status),
  uniqueIndex("allocation_active_tenant_unique").on(table.activeTenantId),
]);

export const rentPayments = pgTable("rentPayments", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  allocationId: integer("allocationId").notNull().references(() => roomAllocations.id, { onDelete: "cascade" }),
  tenantId: integer("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  rentMonth: varchar("rentMonth", { length: 7 }).notNull(),
  dueDate: date("dueDate", { mode: "string" }).notNull(),
  expectedAmountPaise: integer("expectedAmountPaise").notNull(),
  paidAmountPaise: integer("paidAmountPaise").notNull().default(0),
  status: rentStatus("rentStatus").notNull().default("pending"),
  paidOn: date("paidOn", { mode: "string" }),
  paymentMethod: paymentMethod("rentPaymentMethod"),
  notes: text("notes"),
  receiptUrl: text("receiptUrl"),
  receiptReviewStatus: receiptReviewStatus("rentReceiptReviewStatus").notNull().default("not_submitted"),
  receiptReviewedAt: timestamp("receiptReviewedAt", { withTimezone: true }),
  receiptReviewedBy: integer("receiptReviewedBy").references(() => users.id, { onDelete: "set null" }),
  receiptReviewNote: text("receiptReviewNote"),
  overdueNotifiedAt: timestamp("overdueNotifiedAt", { withTimezone: true }),
  recordedBy: integer("recordedBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("rent_allocation_month_unique").on(table.allocationId, table.rentMonth),
  index("rent_building_due_idx").on(table.buildingId, table.dueDate),
  index("rent_tenant_idx").on(table.tenantId),
]);

export const tenantTransfers = pgTable("tenantTransfers", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  tenantId: integer("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  sourceAllocationId: integer("sourceAllocationId").notNull().references(() => roomAllocations.id),
  destinationAllocationId: integer("destinationAllocationId").notNull().references(() => roomAllocations.id),
  sourceRoomId: integer("sourceRoomId").notNull().references(() => rooms.id),
  destinationRoomId: integer("destinationRoomId").notNull().references(() => rooms.id),
  effectiveDate: date("effectiveDate", { mode: "string" }).notNull(),
  sourceMonthlyRentPaise: integer("sourceMonthlyRentPaise").notNull(),
  destinationMonthlyRentPaise: integer("destinationMonthlyRentPaise").notNull(),
  prorationApplied: transferProrationStatus("prorationApplied").notNull().default("no"),
  sourceProratedAmountPaise: integer("sourceProratedAmountPaise"),
  destinationProratedAmountPaise: integer("destinationProratedAmountPaise"),
  sourceRentPaymentId: integer("sourceRentPaymentId").references(() => rentPayments.id, { onDelete: "set null" }),
  destinationRentPaymentId: integer("destinationRentPaymentId").references(() => rentPayments.id, { onDelete: "set null" }),
  recordedBy: integer("recordedBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, table => [
  index("transfer_building_date_idx").on(table.buildingId, table.effectiveDate),
  index("transfer_tenant_date_idx").on(table.tenantId, table.effectiveDate),
]);

export const electricityBills = pgTable("electricityBills", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  roomId: integer("roomId").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  billingMonth: varchar("billingMonth", { length: 7 }).notNull(),
  previousReading: integer("previousReading").notNull(),
  currentReading: integer("currentReading").notNull(),
  unitsConsumed: integer("unitsConsumed").notNull(),
  ratePerUnitPaise: integer("ratePerUnitPaise").notNull(),
  billAmountPaise: integer("billAmountPaise").notNull(),
  paidAmountPaise: integer("paidAmountPaise").notNull().default(0),
  status: rentStatus("electricityStatus").notNull().default("pending"),
  paidOn: date("paidOn", { mode: "string" }),
  paymentMethod: paymentMethod("electricityPaymentMethod"),
  dueDate: date("dueDate", { mode: "string" }),
  notes: text("notes"),
  meterImageUrl: text("meterImageUrl"),
  receiptUrl: text("receiptUrl"),
  receiptReviewStatus: receiptReviewStatus("electricityReceiptReviewStatus").notNull().default("not_submitted"),
  receiptReviewedAt: timestamp("receiptReviewedAt", { withTimezone: true }),
  receiptReviewedBy: integer("receiptReviewedBy").references(() => users.id, { onDelete: "set null" }),
  receiptReviewNote: text("receiptReviewNote"),
  overdueNotifiedAt: timestamp("overdueNotifiedAt", { withTimezone: true }),
  recordedBy: integer("recordedBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("electricity_room_month_unique").on(table.roomId, table.billingMonth),
  index("electricity_building_month_idx").on(table.buildingId, table.billingMonth),
]);

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  roomId: integer("roomId").references(() => rooms.id, { onDelete: "set null" }),
  tenantId: integer("tenantId").references(() => tenants.id, { onDelete: "set null" }),
  liabilityMode: expenseLiabilityMode("expenseLiabilityMode").notNull().default("building"),
  category: expenseCategory("expenseCategory").notNull(),
  amountPaise: integer("amountPaise").notNull(),
  expenseDate: date("expenseDate", { mode: "string" }).notNull(),
  notes: text("notes"),
  receiptUrl: text("receiptUrl"),
  createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index("expense_building_date_idx").on(table.buildingId, table.expenseDate),
  index("expense_room_idx").on(table.roomId),
  index("expense_tenant_idx").on(table.tenantId),
]);

export const operatingCosts = pgTable("operatingCosts", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  roomId: integer("roomId").references(() => rooms.id, { onDelete: "set null" }),
  tenantId: integer("tenantId").references(() => tenants.id, { onDelete: "set null" }),
  liabilityMode: operatingCostLiabilityMode("operatingCostLiabilityMode").notNull().default("building"),
  kind: operatingCostKind("operatingCostKind").notNull(),
  category: operatingCostCategory("operatingCostCategory").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  payeeName: varchar("payeeName", { length: 120 }),
  vendorName: varchar("vendorName", { length: 120 }),
  amountPaise: integer("amountPaise").notNull(),
  paidAmountPaise: integer("paidAmountPaise").notNull().default(0),
  status: operatingCostStatus("operatingCostStatus").notNull().default("pending"),
  workStatus: operatingWorkStatus("operatingWorkStatus").notNull().default("open"),
  costDate: date("costDate", { mode: "string" }).notNull(),
  dueDate: date("dueDate", { mode: "string" }),
  receiptUrl: text("receiptUrl"),
  notes: text("notes"),
  createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index("operating_cost_building_date_idx").on(table.buildingId, table.costDate),
  index("operating_cost_building_status_idx").on(table.buildingId, table.status),
  index("operating_cost_room_idx").on(table.roomId),
  index("operating_cost_tenant_idx").on(table.tenantId),
]);

export const ownerSettlements = pgTable("ownerSettlements", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  billingMonth: varchar("billingMonth", { length: 7 }).notNull(),
  expectedAmountPaise: integer("expectedAmountPaise").notNull(),
  paidAmountPaise: integer("paidAmountPaise").notNull().default(0),
  status: rentStatus("ownerSettlementStatus").notNull().default("pending"),
  dueDate: date("dueDate", { mode: "string" }).notNull(),
  paidOn: date("paidOn", { mode: "string" }),
  paymentMethod: ownerSettlementPaymentMethod("ownerSettlementPaymentMethod"),
  notes: text("notes"),
  receiptUrl: text("receiptUrl"),
  ownerConfirmedAt: timestamp("ownerConfirmedAt", { withTimezone: true }),
  ownerConfirmedBy: integer("ownerConfirmedBy").references(() => users.id, { onDelete: "set null" }),
  createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("owner_settlement_building_month_unique").on(table.buildingId, table.billingMonth),
  index("owner_settlement_building_due_idx").on(table.buildingId, table.dueDate),
]);

export const governmentElectricityPayments = pgTable("governmentElectricityPayments", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  billingMonth: varchar("billingMonth", { length: 7 }).notNull(),
  expectedAmountPaise: integer("expectedAmountPaise").notNull(),
  paidAmountPaise: integer("paidAmountPaise").notNull().default(0),
  status: rentStatus("governmentElectricityPaymentStatus").notNull().default("pending"),
  dueDate: date("dueDate", { mode: "string" }).notNull(),
  paidOn: date("paidOn", { mode: "string" }),
  paymentMethod: ownerSettlementPaymentMethod("governmentElectricityPaymentMethod"),
  notes: text("notes"),
  receiptUrl: text("receiptUrl"),
  createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("government_electricity_building_month_unique").on(table.buildingId, table.billingMonth),
  index("government_electricity_building_due_idx").on(table.buildingId, table.dueDate),
]);

export const managerCreditAdjustments = pgTable("managerCreditAdjustments", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  billingMonth: varchar("billingMonth", { length: 7 }).notNull(),
  amountPaise: integer("amountPaise").notNull(),
  notes: text("notes").notNull(),
  createdBy: integer("createdBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
}, table => [index("manager_credit_adjustment_building_month_idx").on(table.buildingId, table.billingMonth)]);

export const changeAuditLogs = pgTable("changeAuditLogs", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").references(() => buildings.id, { onDelete: "set null" }),
  entityType: varchar("entityType", { length: 48 }).notNull(),
  entityId: integer("entityId").notNull(),
  action: varchar("action", { length: 48 }).notNull(),
  snapshotJson: text("snapshotJson").notNull(),
  createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
}, table => [
  index("change_audit_building_created_idx").on(table.buildingId, table.createdAt),
  index("change_audit_entity_idx").on(table.entityType, table.entityId),
]);

export const tenantCharges = pgTable("tenantCharges", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  tenantId: integer("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  roomId: integer("roomId").references(() => rooms.id, { onDelete: "set null" }),
  sourceType: tenantChargeSourceType("tenantChargeSourceType").notNull(),
  sourceId: integer("sourceId").notNull(),
  billingMonth: varchar("billingMonth", { length: 7 }),
  title: varchar("title", { length: 180 }).notNull(),
  expectedAmountPaise: integer("expectedAmountPaise").notNull(),
  paidAmountPaise: integer("paidAmountPaise").notNull().default(0),
  status: rentStatus("tenantChargeStatus").notNull().default("pending"),
  dueDate: date("dueDate", { mode: "string" }),
  paidOn: date("paidOn", { mode: "string" }),
  paymentMethod: paymentMethod("tenantChargePaymentMethod"),
  notes: text("notes"),
  receiptUrl: text("receiptUrl"),
  receiptReviewStatus: receiptReviewStatus("tenantChargeReceiptReviewStatus").notNull().default("not_submitted"),
  receiptReviewedAt: timestamp("receiptReviewedAt", { withTimezone: true }),
  receiptReviewedBy: integer("receiptReviewedBy").references(() => users.id, { onDelete: "set null" }),
  receiptReviewNote: text("receiptReviewNote"),
  createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("tenant_charge_source_tenant_month_unique").on(table.sourceType, table.sourceId, table.tenantId, table.billingMonth),
  index("tenant_charge_building_status_idx").on(table.buildingId, table.status),
  index("tenant_charge_tenant_idx").on(table.tenantId),
]);

export const serviceCharges = pgTable("serviceCharges", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  amountPaise: integer("amountPaise").notNull(),
  billingCycle: billingCycle("billingCycle").notNull().default("monthly"),
  dueDay: integer("dueDay").notNull().default(1),
  active: activeStatus("serviceChargeStatus").notNull().default("active"),
  notes: text("notes"),
  createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [index("service_charge_building_idx").on(table.buildingId)]);

export const tenantServices = pgTable("tenantServices", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  tenantId: integer("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  serviceType: tenantServiceType("tenantServiceType").notNull(),
  monthlyChargePaise: integer("monthlyChargePaise").notNull(),
  active: activeStatus("tenantServiceStatus").notNull().default("active"),
  notes: text("notes"),
  createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index("tenant_service_building_idx").on(table.buildingId),
  index("tenant_service_tenant_idx").on(table.tenantId),
]);

export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  tenantId: integer("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  rentPaymentId: integer("rentPaymentId").references(() => rentPayments.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  dueDate: date("dueDate", { mode: "string" }).notNull(),
  status: reminderStatus("reminderStatus").notNull().default("active"),
  notifiedAt: timestamp("notifiedAt", { withTimezone: true }),
  deliveryRequestedAt: timestamp("deliveryRequestedAt", { withTimezone: true }),
  deliveryRequestedBy: integer("deliveryRequestedBy").references(() => users.id, { onDelete: "set null" }),
  createdBy: integer("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index("reminder_building_due_idx").on(table.buildingId, table.dueDate),
  uniqueIndex("reminder_rent_payment_unique").on(table.rentPaymentId),
]);

export const managerNotifications = pgTable("managerNotifications", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").notNull().references(() => buildings.id, { onDelete: "cascade" }),
  kind: managerNotificationKind("managerNotificationKind").notNull(),
  referenceKey: varchar("referenceKey", { length: 180 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  dueDate: date("dueDate", { mode: "string" }),
  status: notificationStatus("managerNotificationStatus").notNull().default("unread"),
  readAt: timestamp("readAt", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("manager_notification_reference_unique").on(table.referenceKey),
  index("manager_notification_building_status_idx").on(table.buildingId, table.status),
]);

export const exportHistory = pgTable("exportHistory", {
  id: serial("id").primaryKey(),
  buildingId: integer("buildingId").references(() => buildings.id, { onDelete: "set null" }),
  requestedBy: integer("requestedBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  exportType: exportType("exportType").notNull(),
  dateFrom: date("dateFrom", { mode: "string" }),
  dateTo: date("dateTo", { mode: "string" }),
  createdAt: createdAt(),
}, table => [index("export_requester_created_idx").on(table.requestedBy, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
