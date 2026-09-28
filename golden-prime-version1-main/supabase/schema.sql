-- Golden Prime PG Supabase schema bundle.
-- Apply the numbered files in drizzle-pg/migrations/ order, or use this concatenated file in a new Supabase SQL editor.

-- SOURCE: drizzle-pg/migrations/0000_glossy_slipstream.sql
CREATE TYPE "public"."active_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."air_conditioning" AS ENUM('ac', 'non_ac');--> statement-breakpoint
CREATE TYPE "public"."allocation_primary_payer" AS ENUM('no', 'yes');--> statement-breakpoint
CREATE TYPE "public"."allocation_status" AS ENUM('active', 'vacated');--> statement-breakpoint
CREATE TYPE "public"."balcony" AS ENUM('balcony', 'non_balcony');--> statement-breakpoint
CREATE TYPE "public"."billing_cycle" AS ENUM('monthly', 'one_time');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('maintenance', 'groceries', 'salaries', 'utilities', 'rent', 'water', 'labor', 'tiffin', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_liability_mode" AS ENUM('building', 'room_shared', 'tenant_assigned');--> statement-breakpoint
CREATE TYPE "public"."export_type" AS ENUM('tenants', 'rent', 'electricity', 'expenses', 'selected', 'complete');--> statement-breakpoint
CREATE TYPE "public"."manager_notification_kind" AS ENUM('rent_cycle', 'rent_upcoming', 'rent_overdue', 'electricity_upcoming', 'electricity_overdue');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('unread', 'read');--> statement-breakpoint
CREATE TYPE "public"."operating_cost_category" AS ENUM('helper_salary', 'cook_salary', 'staff_advance', 'staff_settlement', 'groceries', 'utensils', 'gas', 'cleaning', 'water', 'repair_electrician', 'repair_plumber', 'rent_equipment', 'other');--> statement-breakpoint
CREATE TYPE "public"."operating_cost_kind" AS ENUM('staff', 'supplies', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."operating_cost_liability_mode" AS ENUM('building', 'room_shared', 'tenant_assigned');--> statement-breakpoint
CREATE TYPE "public"."operating_cost_status" AS ENUM('pending', 'partial', 'paid');--> statement-breakpoint
CREATE TYPE "public"."operating_work_status" AS ENUM('open', 'in_progress', 'complete');--> statement-breakpoint
CREATE TYPE "public"."owner_settlement_payment_method" AS ENUM('cash', 'upi', 'bank_transfer', 'cheque');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'upi', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."receipt_review_status" AS ENUM('not_submitted', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('active', 'complete');--> statement-breakpoint
CREATE TYPE "public"."rent_status" AS ENUM('paid', 'pending', 'partial');--> statement-breakpoint
CREATE TYPE "public"."room_billing_mode" AS ENUM('equal_split', 'manager_set', 'primary_payer');--> statement-breakpoint
CREATE TYPE "public"."room_type" AS ENUM('single', 'double', 'triple', 'four', 'individual', 'coliving');--> statement-breakpoint
CREATE TYPE "public"."tenant_charge_source_type" AS ENUM('electricity', 'expense', 'operating_cost', 'tenant_service');--> statement-breakpoint
CREATE TYPE "public"."tenant_service_type" AS ENUM('tiffin', 'water_bottle', 'other');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."transfer_proration_status" AS ENUM('no', 'yes');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'manager', 'helper', 'cook', 'tenant');--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"address" text NOT NULL,
	"city" varchar(80),
	"landmark" varchar(160),
	"contactPhone" varchar(32),
	"imageUrl" text,
	"mapUrl" text,
	"ownerCutPercent" integer DEFAULT 0 NOT NULL,
	"ownerMonthlyCutPaise" integer DEFAULT 0 NOT NULL,
	"paymentBankName" varchar(120),
	"paymentAccountName" varchar(120),
	"paymentAccountNumber" varchar(64),
	"paymentIfsc" varchar(32),
	"paymentUpiId" varchar(120),
	"paymentQrUrl" text,
	"electricityRatePaise" integer DEFAULT 800 NOT NULL,
	"rentDueDay" integer DEFAULT 5 NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"ownerId" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "changeAuditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer,
	"entityType" varchar(48) NOT NULL,
	"entityId" integer NOT NULL,
	"action" varchar(48) NOT NULL,
	"snapshotJson" text NOT NULL,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "electricityBills" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"roomId" integer NOT NULL,
	"billingMonth" varchar(7) NOT NULL,
	"previousReading" integer NOT NULL,
	"currentReading" integer NOT NULL,
	"unitsConsumed" integer NOT NULL,
	"ratePerUnitPaise" integer NOT NULL,
	"billAmountPaise" integer NOT NULL,
	"paidAmountPaise" integer DEFAULT 0 NOT NULL,
	"status" "rent_status" DEFAULT 'pending' NOT NULL,
	"paidOn" date,
	"paymentMethod" "payment_method",
	"dueDate" date,
	"notes" text,
	"meterImageUrl" text,
	"receiptUrl" text,
	"receiptReviewStatus" "receipt_review_status" DEFAULT 'not_submitted' NOT NULL,
	"receiptReviewedAt" timestamp with time zone,
	"receiptReviewedBy" integer,
	"receiptReviewNote" text,
	"overdueNotifiedAt" timestamp with time zone,
	"recordedBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"roomId" integer,
	"tenantId" integer,
	"liabilityMode" "expense_liability_mode" DEFAULT 'building' NOT NULL,
	"category" "expense_category" NOT NULL,
	"amountPaise" integer NOT NULL,
	"expenseDate" date NOT NULL,
	"notes" text,
	"receiptUrl" text,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exportHistory" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer,
	"requestedBy" integer NOT NULL,
	"exportType" "export_type" NOT NULL,
	"dateFrom" date,
	"dateTo" date,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "floors" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"name" varchar(80) NOT NULL,
	"level" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "governmentElectricityPayments" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"billingMonth" varchar(7) NOT NULL,
	"expectedAmountPaise" integer NOT NULL,
	"paidAmountPaise" integer DEFAULT 0 NOT NULL,
	"status" "rent_status" DEFAULT 'pending' NOT NULL,
	"dueDate" date NOT NULL,
	"paidOn" date,
	"paymentMethod" "owner_settlement_payment_method",
	"notes" text,
	"receiptUrl" text,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managerCreditAdjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"billingMonth" varchar(7) NOT NULL,
	"amountPaise" integer NOT NULL,
	"notes" text NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managerNotifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"kind" "manager_notification_kind" NOT NULL,
	"referenceKey" varchar(180) NOT NULL,
	"title" varchar(180) NOT NULL,
	"body" text NOT NULL,
	"dueDate" date,
	"status" "notification_status" DEFAULT 'unread' NOT NULL,
	"readAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operatingCosts" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"roomId" integer,
	"tenantId" integer,
	"liabilityMode" "operating_cost_liability_mode" DEFAULT 'building' NOT NULL,
	"kind" "operating_cost_kind" NOT NULL,
	"category" "operating_cost_category" NOT NULL,
	"title" varchar(160) NOT NULL,
	"payeeName" varchar(120),
	"vendorName" varchar(120),
	"amountPaise" integer NOT NULL,
	"paidAmountPaise" integer DEFAULT 0 NOT NULL,
	"status" "operating_cost_status" DEFAULT 'pending' NOT NULL,
	"workStatus" "operating_work_status" DEFAULT 'open' NOT NULL,
	"costDate" date NOT NULL,
	"dueDate" date,
	"receiptUrl" text,
	"notes" text,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ownerSettlements" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"billingMonth" varchar(7) NOT NULL,
	"expectedAmountPaise" integer NOT NULL,
	"paidAmountPaise" integer DEFAULT 0 NOT NULL,
	"status" "rent_status" DEFAULT 'pending' NOT NULL,
	"dueDate" date NOT NULL,
	"paidOn" date,
	"paymentMethod" "owner_settlement_payment_method",
	"notes" text,
	"receiptUrl" text,
	"ownerConfirmedAt" timestamp with time zone,
	"ownerConfirmedBy" integer,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"tenantId" integer,
	"rentPaymentId" integer,
	"title" varchar(180) NOT NULL,
	"dueDate" date NOT NULL,
	"status" "reminder_status" DEFAULT 'active' NOT NULL,
	"notifiedAt" timestamp with time zone,
	"deliveryRequestedAt" timestamp with time zone,
	"deliveryRequestedBy" integer,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rentPayments" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"allocationId" integer NOT NULL,
	"tenantId" integer NOT NULL,
	"rentMonth" varchar(7) NOT NULL,
	"dueDate" date NOT NULL,
	"expectedAmountPaise" integer NOT NULL,
	"paidAmountPaise" integer DEFAULT 0 NOT NULL,
	"status" "rent_status" DEFAULT 'pending' NOT NULL,
	"paidOn" date,
	"paymentMethod" "payment_method",
	"notes" text,
	"receiptUrl" text,
	"receiptReviewStatus" "receipt_review_status" DEFAULT 'not_submitted' NOT NULL,
	"receiptReviewedAt" timestamp with time zone,
	"receiptReviewedBy" integer,
	"receiptReviewNote" text,
	"overdueNotifiedAt" timestamp with time zone,
	"recordedBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roomAllocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"roomId" integer NOT NULL,
	"tenantId" integer NOT NULL,
	"activeTenantId" integer,
	"moveInDate" date NOT NULL,
	"moveOutDate" date,
	"bedLabel" varchar(32),
	"isPrimaryPayer" "allocation_primary_payer" DEFAULT 'no' NOT NULL,
	"monthlyRentPaise" integer NOT NULL,
	"depositPaise" integer DEFAULT 0 NOT NULL,
	"status" "allocation_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"floorId" integer,
	"number" varchar(32) NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"roomType" "room_type" DEFAULT 'single' NOT NULL,
	"billingMode" "room_billing_mode" DEFAULT 'equal_split' NOT NULL,
	"airConditioning" "air_conditioning" DEFAULT 'non_ac' NOT NULL,
	"balcony" "balcony" DEFAULT 'non_balcony' NOT NULL,
	"imageUrl" text,
	"defaultRentPaise" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serviceCharges" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"amountPaise" integer NOT NULL,
	"billingCycle" "billing_cycle" DEFAULT 'monthly' NOT NULL,
	"dueDay" integer DEFAULT 1 NOT NULL,
	"active" "active_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staffAssignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"userId" integer NOT NULL,
	"assignedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenantCharges" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"tenantId" integer NOT NULL,
	"roomId" integer,
	"sourceType" "tenant_charge_source_type" NOT NULL,
	"sourceId" integer NOT NULL,
	"billingMonth" varchar(7),
	"title" varchar(180) NOT NULL,
	"expectedAmountPaise" integer NOT NULL,
	"paidAmountPaise" integer DEFAULT 0 NOT NULL,
	"status" "rent_status" DEFAULT 'pending' NOT NULL,
	"dueDate" date,
	"paidOn" date,
	"paymentMethod" "payment_method",
	"notes" text,
	"receiptUrl" text,
	"receiptReviewStatus" "receipt_review_status" DEFAULT 'not_submitted' NOT NULL,
	"receiptReviewedAt" timestamp with time zone,
	"receiptReviewedBy" integer,
	"receiptReviewNote" text,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenantServices" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"tenantId" integer NOT NULL,
	"serviceType" "tenant_service_type" NOT NULL,
	"monthlyChargePaise" integer NOT NULL,
	"active" "active_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenantTransfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"tenantId" integer NOT NULL,
	"sourceAllocationId" integer NOT NULL,
	"destinationAllocationId" integer NOT NULL,
	"sourceRoomId" integer NOT NULL,
	"destinationRoomId" integer NOT NULL,
	"effectiveDate" date NOT NULL,
	"sourceMonthlyRentPaise" integer NOT NULL,
	"destinationMonthlyRentPaise" integer NOT NULL,
	"prorationApplied" "transfer_proration_status" DEFAULT 'no' NOT NULL,
	"sourceProratedAmountPaise" integer,
	"destinationProratedAmountPaise" integer,
	"sourceRentPaymentId" integer,
	"destinationRentPaymentId" integer,
	"recordedBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"buildingId" integer NOT NULL,
	"userId" integer,
	"fullName" varchar(120) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"email" varchar(320),
	"emergencyContactName" varchar(120),
	"emergencyContactPhone" varchar(32),
	"address" text,
	"identityDocumentUrl" text,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"phone" varchar(20),
	"passwordHash" varchar(255),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'helper' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_ownerId_users_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changeAuditLogs" ADD CONSTRAINT "changeAuditLogs_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changeAuditLogs" ADD CONSTRAINT "changeAuditLogs_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electricityBills" ADD CONSTRAINT "electricityBills_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electricityBills" ADD CONSTRAINT "electricityBills_roomId_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electricityBills" ADD CONSTRAINT "electricityBills_receiptReviewedBy_users_id_fk" FOREIGN KEY ("receiptReviewedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electricityBills" ADD CONSTRAINT "electricityBills_recordedBy_users_id_fk" FOREIGN KEY ("recordedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_roomId_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exportHistory" ADD CONSTRAINT "exportHistory_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exportHistory" ADD CONSTRAINT "exportHistory_requestedBy_users_id_fk" FOREIGN KEY ("requestedBy") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "floors" ADD CONSTRAINT "floors_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governmentElectricityPayments" ADD CONSTRAINT "governmentElectricityPayments_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governmentElectricityPayments" ADD CONSTRAINT "governmentElectricityPayments_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managerCreditAdjustments" ADD CONSTRAINT "managerCreditAdjustments_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managerCreditAdjustments" ADD CONSTRAINT "managerCreditAdjustments_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managerNotifications" ADD CONSTRAINT "managerNotifications_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operatingCosts" ADD CONSTRAINT "operatingCosts_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operatingCosts" ADD CONSTRAINT "operatingCosts_roomId_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operatingCosts" ADD CONSTRAINT "operatingCosts_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operatingCosts" ADD CONSTRAINT "operatingCosts_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownerSettlements" ADD CONSTRAINT "ownerSettlements_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownerSettlements" ADD CONSTRAINT "ownerSettlements_ownerConfirmedBy_users_id_fk" FOREIGN KEY ("ownerConfirmedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownerSettlements" ADD CONSTRAINT "ownerSettlements_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_rentPaymentId_rentPayments_id_fk" FOREIGN KEY ("rentPaymentId") REFERENCES "public"."rentPayments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_deliveryRequestedBy_users_id_fk" FOREIGN KEY ("deliveryRequestedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentPayments" ADD CONSTRAINT "rentPayments_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentPayments" ADD CONSTRAINT "rentPayments_allocationId_roomAllocations_id_fk" FOREIGN KEY ("allocationId") REFERENCES "public"."roomAllocations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentPayments" ADD CONSTRAINT "rentPayments_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentPayments" ADD CONSTRAINT "rentPayments_receiptReviewedBy_users_id_fk" FOREIGN KEY ("receiptReviewedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rentPayments" ADD CONSTRAINT "rentPayments_recordedBy_users_id_fk" FOREIGN KEY ("recordedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomAllocations" ADD CONSTRAINT "roomAllocations_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomAllocations" ADD CONSTRAINT "roomAllocations_roomId_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomAllocations" ADD CONSTRAINT "roomAllocations_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roomAllocations" ADD CONSTRAINT "roomAllocations_activeTenantId_tenants_id_fk" FOREIGN KEY ("activeTenantId") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floorId_floors_id_fk" FOREIGN KEY ("floorId") REFERENCES "public"."floors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serviceCharges" ADD CONSTRAINT "serviceCharges_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serviceCharges" ADD CONSTRAINT "serviceCharges_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffAssignments" ADD CONSTRAINT "staffAssignments_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffAssignments" ADD CONSTRAINT "staffAssignments_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantCharges" ADD CONSTRAINT "tenantCharges_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantCharges" ADD CONSTRAINT "tenantCharges_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantCharges" ADD CONSTRAINT "tenantCharges_roomId_rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantCharges" ADD CONSTRAINT "tenantCharges_receiptReviewedBy_users_id_fk" FOREIGN KEY ("receiptReviewedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantCharges" ADD CONSTRAINT "tenantCharges_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantServices" ADD CONSTRAINT "tenantServices_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantServices" ADD CONSTRAINT "tenantServices_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantServices" ADD CONSTRAINT "tenantServices_createdBy_users_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantTransfers" ADD CONSTRAINT "tenantTransfers_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantTransfers" ADD CONSTRAINT "tenantTransfers_tenantId_tenants_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantTransfers" ADD CONSTRAINT "tenantTransfers_sourceAllocationId_roomAllocations_id_fk" FOREIGN KEY ("sourceAllocationId") REFERENCES "public"."roomAllocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantTransfers" ADD CONSTRAINT "tenantTransfers_destinationAllocationId_roomAllocations_id_fk" FOREIGN KEY ("destinationAllocationId") REFERENCES "public"."roomAllocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantTransfers" ADD CONSTRAINT "tenantTransfers_sourceRoomId_rooms_id_fk" FOREIGN KEY ("sourceRoomId") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantTransfers" ADD CONSTRAINT "tenantTransfers_destinationRoomId_rooms_id_fk" FOREIGN KEY ("destinationRoomId") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantTransfers" ADD CONSTRAINT "tenantTransfers_sourceRentPaymentId_rentPayments_id_fk" FOREIGN KEY ("sourceRentPaymentId") REFERENCES "public"."rentPayments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantTransfers" ADD CONSTRAINT "tenantTransfers_destinationRentPaymentId_rentPayments_id_fk" FOREIGN KEY ("destinationRentPaymentId") REFERENCES "public"."rentPayments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenantTransfers" ADD CONSTRAINT "tenantTransfers_recordedBy_users_id_fk" FOREIGN KEY ("recordedBy") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_buildingId_buildings_id_fk" FOREIGN KEY ("buildingId") REFERENCES "public"."buildings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_audit_building_created_idx" ON "changeAuditLogs" USING btree ("buildingId","createdAt");--> statement-breakpoint
CREATE INDEX "change_audit_entity_idx" ON "changeAuditLogs" USING btree ("entityType","entityId");--> statement-breakpoint
CREATE UNIQUE INDEX "electricity_room_month_unique" ON "electricityBills" USING btree ("roomId","billingMonth");--> statement-breakpoint
CREATE INDEX "electricity_building_month_idx" ON "electricityBills" USING btree ("buildingId","billingMonth");--> statement-breakpoint
CREATE INDEX "expense_building_date_idx" ON "expenses" USING btree ("buildingId","expenseDate");--> statement-breakpoint
CREATE INDEX "expense_room_idx" ON "expenses" USING btree ("roomId");--> statement-breakpoint
CREATE INDEX "expense_tenant_idx" ON "expenses" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "export_requester_created_idx" ON "exportHistory" USING btree ("requestedBy","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "floor_building_level_unique" ON "floors" USING btree ("buildingId","level");--> statement-breakpoint
CREATE INDEX "floor_building_idx" ON "floors" USING btree ("buildingId");--> statement-breakpoint
CREATE UNIQUE INDEX "government_electricity_building_month_unique" ON "governmentElectricityPayments" USING btree ("buildingId","billingMonth");--> statement-breakpoint
CREATE INDEX "government_electricity_building_due_idx" ON "governmentElectricityPayments" USING btree ("buildingId","dueDate");--> statement-breakpoint
CREATE INDEX "manager_credit_adjustment_building_month_idx" ON "managerCreditAdjustments" USING btree ("buildingId","billingMonth");--> statement-breakpoint
CREATE UNIQUE INDEX "manager_notification_reference_unique" ON "managerNotifications" USING btree ("referenceKey");--> statement-breakpoint
CREATE INDEX "manager_notification_building_status_idx" ON "managerNotifications" USING btree ("buildingId","status");--> statement-breakpoint
CREATE INDEX "operating_cost_building_date_idx" ON "operatingCosts" USING btree ("buildingId","costDate");--> statement-breakpoint
CREATE INDEX "operating_cost_building_status_idx" ON "operatingCosts" USING btree ("buildingId","status");--> statement-breakpoint
CREATE INDEX "operating_cost_room_idx" ON "operatingCosts" USING btree ("roomId");--> statement-breakpoint
CREATE INDEX "operating_cost_tenant_idx" ON "operatingCosts" USING btree ("tenantId");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_settlement_building_month_unique" ON "ownerSettlements" USING btree ("buildingId","billingMonth");--> statement-breakpoint
CREATE INDEX "owner_settlement_building_due_idx" ON "ownerSettlements" USING btree ("buildingId","dueDate");--> statement-breakpoint
CREATE INDEX "reminder_building_due_idx" ON "reminders" USING btree ("buildingId","dueDate");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_rent_payment_unique" ON "reminders" USING btree ("rentPaymentId");--> statement-breakpoint
CREATE UNIQUE INDEX "rent_allocation_month_unique" ON "rentPayments" USING btree ("allocationId","rentMonth");--> statement-breakpoint
CREATE INDEX "rent_building_due_idx" ON "rentPayments" USING btree ("buildingId","dueDate");--> statement-breakpoint
CREATE INDEX "rent_tenant_idx" ON "rentPayments" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "allocation_room_status_idx" ON "roomAllocations" USING btree ("roomId","status");--> statement-breakpoint
CREATE INDEX "allocation_tenant_status_idx" ON "roomAllocations" USING btree ("tenantId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_active_tenant_unique" ON "roomAllocations" USING btree ("activeTenantId");--> statement-breakpoint
CREATE UNIQUE INDEX "room_building_number_unique" ON "rooms" USING btree ("buildingId","number");--> statement-breakpoint
CREATE INDEX "room_floor_idx" ON "rooms" USING btree ("floorId");--> statement-breakpoint
CREATE INDEX "service_charge_building_idx" ON "serviceCharges" USING btree ("buildingId");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_assignment_unique" ON "staffAssignments" USING btree ("buildingId","userId");--> statement-breakpoint
CREATE INDEX "staff_assignment_user_idx" ON "staffAssignments" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_charge_source_tenant_month_unique" ON "tenantCharges" USING btree ("sourceType","sourceId","tenantId","billingMonth");--> statement-breakpoint
CREATE INDEX "tenant_charge_building_status_idx" ON "tenantCharges" USING btree ("buildingId","status");--> statement-breakpoint
CREATE INDEX "tenant_charge_tenant_idx" ON "tenantCharges" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "tenant_service_building_idx" ON "tenantServices" USING btree ("buildingId");--> statement-breakpoint
CREATE INDEX "tenant_service_tenant_idx" ON "tenantServices" USING btree ("tenantId");--> statement-breakpoint
CREATE INDEX "transfer_building_date_idx" ON "tenantTransfers" USING btree ("buildingId","effectiveDate");--> statement-breakpoint
CREATE INDEX "transfer_tenant_date_idx" ON "tenantTransfers" USING btree ("tenantId","effectiveDate");--> statement-breakpoint
CREATE INDEX "tenant_building_idx" ON "tenants" USING btree ("buildingId");--> statement-breakpoint
CREATE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON public."users" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER buildings_set_updated_at BEFORE UPDATE ON public."buildings" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER rooms_set_updated_at BEFORE UPDATE ON public."rooms" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON public."tenants" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER room_allocations_set_updated_at BEFORE UPDATE ON public."roomAllocations" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER rent_payments_set_updated_at BEFORE UPDATE ON public."rentPayments" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER electricity_bills_set_updated_at BEFORE UPDATE ON public."electricityBills" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON public."expenses" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER operating_costs_set_updated_at BEFORE UPDATE ON public."operatingCosts" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER owner_settlements_set_updated_at BEFORE UPDATE ON public."ownerSettlements" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER government_electricity_payments_set_updated_at BEFORE UPDATE ON public."governmentElectricityPayments" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER tenant_charges_set_updated_at BEFORE UPDATE ON public."tenantCharges" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER service_charges_set_updated_at BEFORE UPDATE ON public."serviceCharges" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER tenant_services_set_updated_at BEFORE UPDATE ON public."tenantServices" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER reminders_set_updated_at BEFORE UPDATE ON public."reminders" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER manager_notifications_set_updated_at BEFORE UPDATE ON public."managerNotifications" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- SOURCE: drizzle-pg/migrations/0001_harden_updated_at_trigger.sql
ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM authenticated;


-- SOURCE: drizzle-pg/migrations/0002_rename_rooms_billing_mode.sql
ALTER TABLE public."rooms" RENAME COLUMN "billingMode" TO "roomBillingMode";


-- SOURCE: drizzle-pg/migrations/0003_align_source_enum_column_names.sql
ALTER TABLE public."tenants" RENAME COLUMN "status" TO "tenantStatus";
ALTER TABLE public."roomAllocations" RENAME COLUMN "isPrimaryPayer" TO "allocationPrimaryPayer";
ALTER TABLE public."roomAllocations" RENAME COLUMN "status" TO "allocationStatus";
ALTER TABLE public."rentPayments" RENAME COLUMN "status" TO "rentStatus";
ALTER TABLE public."rentPayments" RENAME COLUMN "paymentMethod" TO "rentPaymentMethod";
ALTER TABLE public."rentPayments" RENAME COLUMN "receiptReviewStatus" TO "rentReceiptReviewStatus";
ALTER TABLE public."electricityBills" RENAME COLUMN "status" TO "electricityStatus";
ALTER TABLE public."electricityBills" RENAME COLUMN "paymentMethod" TO "electricityPaymentMethod";
ALTER TABLE public."electricityBills" RENAME COLUMN "receiptReviewStatus" TO "electricityReceiptReviewStatus";
ALTER TABLE public."expenses" RENAME COLUMN "liabilityMode" TO "expenseLiabilityMode";
ALTER TABLE public."expenses" RENAME COLUMN "category" TO "expenseCategory";
ALTER TABLE public."operatingCosts" RENAME COLUMN "liabilityMode" TO "operatingCostLiabilityMode";
ALTER TABLE public."operatingCosts" RENAME COLUMN "kind" TO "operatingCostKind";
ALTER TABLE public."operatingCosts" RENAME COLUMN "category" TO "operatingCostCategory";
ALTER TABLE public."operatingCosts" RENAME COLUMN "status" TO "operatingCostStatus";
ALTER TABLE public."operatingCosts" RENAME COLUMN "workStatus" TO "operatingWorkStatus";
ALTER TABLE public."ownerSettlements" RENAME COLUMN "status" TO "ownerSettlementStatus";
ALTER TABLE public."ownerSettlements" RENAME COLUMN "paymentMethod" TO "ownerSettlementPaymentMethod";
ALTER TABLE public."governmentElectricityPayments" RENAME COLUMN "status" TO "governmentElectricityPaymentStatus";
ALTER TABLE public."governmentElectricityPayments" RENAME COLUMN "paymentMethod" TO "governmentElectricityPaymentMethod";
ALTER TABLE public."tenantCharges" RENAME COLUMN "sourceType" TO "tenantChargeSourceType";
ALTER TABLE public."tenantCharges" RENAME COLUMN "status" TO "tenantChargeStatus";
ALTER TABLE public."tenantCharges" RENAME COLUMN "paymentMethod" TO "tenantChargePaymentMethod";
ALTER TABLE public."tenantCharges" RENAME COLUMN "receiptReviewStatus" TO "tenantChargeReceiptReviewStatus";
ALTER TABLE public."serviceCharges" RENAME COLUMN "active" TO "serviceChargeStatus";
ALTER TABLE public."tenantServices" RENAME COLUMN "serviceType" TO "tenantServiceType";
ALTER TABLE public."tenantServices" RENAME COLUMN "active" TO "tenantServiceStatus";
ALTER TABLE public."reminders" RENAME COLUMN "status" TO "reminderStatus";
ALTER TABLE public."managerNotifications" RENAME COLUMN "kind" TO "managerNotificationKind";
ALTER TABLE public."managerNotifications" RENAME COLUMN "status" TO "managerNotificationStatus";


-- SOURCE: drizzle-pg/migrations/0004_reset_imported_id_sequences.sql
SELECT setval(pg_get_serial_sequence('public.users', 'id'), COALESCE((SELECT MAX(id) FROM public.users), 1), EXISTS (SELECT 1 FROM public.users));
SELECT setval(pg_get_serial_sequence('public.buildings', 'id'), COALESCE((SELECT MAX(id) FROM public.buildings), 1), EXISTS (SELECT 1 FROM public.buildings));
SELECT setval(pg_get_serial_sequence('public."staffAssignments"', 'id'), COALESCE((SELECT MAX(id) FROM public."staffAssignments"), 1), EXISTS (SELECT 1 FROM public."staffAssignments"));
SELECT setval(pg_get_serial_sequence('public.floors', 'id'), COALESCE((SELECT MAX(id) FROM public.floors), 1), EXISTS (SELECT 1 FROM public.floors));
SELECT setval(pg_get_serial_sequence('public.rooms', 'id'), COALESCE((SELECT MAX(id) FROM public.rooms), 1), EXISTS (SELECT 1 FROM public.rooms));
SELECT setval(pg_get_serial_sequence('public.tenants', 'id'), COALESCE((SELECT MAX(id) FROM public.tenants), 1), EXISTS (SELECT 1 FROM public.tenants));
SELECT setval(pg_get_serial_sequence('public."roomAllocations"', 'id'), COALESCE((SELECT MAX(id) FROM public."roomAllocations"), 1), EXISTS (SELECT 1 FROM public."roomAllocations"));
SELECT setval(pg_get_serial_sequence('public."rentPayments"', 'id'), COALESCE((SELECT MAX(id) FROM public."rentPayments"), 1), EXISTS (SELECT 1 FROM public."rentPayments"));
SELECT setval(pg_get_serial_sequence('public."tenantTransfers"', 'id'), COALESCE((SELECT MAX(id) FROM public."tenantTransfers"), 1), EXISTS (SELECT 1 FROM public."tenantTransfers"));
SELECT setval(pg_get_serial_sequence('public."electricityBills"', 'id'), COALESCE((SELECT MAX(id) FROM public."electricityBills"), 1), EXISTS (SELECT 1 FROM public."electricityBills"));
SELECT setval(pg_get_serial_sequence('public.expenses', 'id'), COALESCE((SELECT MAX(id) FROM public.expenses), 1), EXISTS (SELECT 1 FROM public.expenses));
SELECT setval(pg_get_serial_sequence('public."operatingCosts"', 'id'), COALESCE((SELECT MAX(id) FROM public."operatingCosts"), 1), EXISTS (SELECT 1 FROM public."operatingCosts"));
SELECT setval(pg_get_serial_sequence('public."ownerSettlements"', 'id'), COALESCE((SELECT MAX(id) FROM public."ownerSettlements"), 1), EXISTS (SELECT 1 FROM public."ownerSettlements"));
SELECT setval(pg_get_serial_sequence('public."governmentElectricityPayments"', 'id'), COALESCE((SELECT MAX(id) FROM public."governmentElectricityPayments"), 1), EXISTS (SELECT 1 FROM public."governmentElectricityPayments"));
SELECT setval(pg_get_serial_sequence('public."managerCreditAdjustments"', 'id'), COALESCE((SELECT MAX(id) FROM public."managerCreditAdjustments"), 1), EXISTS (SELECT 1 FROM public."managerCreditAdjustments"));
SELECT setval(pg_get_serial_sequence('public."changeAuditLogs"', 'id'), COALESCE((SELECT MAX(id) FROM public."changeAuditLogs"), 1), EXISTS (SELECT 1 FROM public."changeAuditLogs"));
SELECT setval(pg_get_serial_sequence('public."tenantCharges"', 'id'), COALESCE((SELECT MAX(id) FROM public."tenantCharges"), 1), EXISTS (SELECT 1 FROM public."tenantCharges"));
SELECT setval(pg_get_serial_sequence('public."serviceCharges"', 'id'), COALESCE((SELECT MAX(id) FROM public."serviceCharges"), 1), EXISTS (SELECT 1 FROM public."serviceCharges"));
SELECT setval(pg_get_serial_sequence('public."tenantServices"', 'id'), COALESCE((SELECT MAX(id) FROM public."tenantServices"), 1), EXISTS (SELECT 1 FROM public."tenantServices"));
SELECT setval(pg_get_serial_sequence('public.reminders', 'id'), COALESCE((SELECT MAX(id) FROM public.reminders), 1), EXISTS (SELECT 1 FROM public.reminders));
SELECT setval(pg_get_serial_sequence('public."managerNotifications"', 'id'), COALESCE((SELECT MAX(id) FROM public."managerNotifications"), 1), EXISTS (SELECT 1 FROM public."managerNotifications"));
SELECT setval(pg_get_serial_sequence('public."exportHistory"', 'id'), COALESCE((SELECT MAX(id) FROM public."exportHistory"), 1), EXISTS (SELECT 1 FROM public."exportHistory"));

