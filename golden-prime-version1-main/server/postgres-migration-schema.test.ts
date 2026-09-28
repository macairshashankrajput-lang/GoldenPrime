import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const postgresSchema = readFileSync(new URL("../drizzle-pg/schema.ts", import.meta.url), "utf8");
const initialMigration = readFileSync(new URL("../drizzle-pg/migrations/0000_glossy_slipstream.sql", import.meta.url), "utf8");
const hardeningMigration = readFileSync(new URL("../drizzle-pg/migrations/0001_harden_updated_at_trigger.sql", import.meta.url), "utf8");

describe("parallel PostgreSQL migration schema", () => {
  it("defines the full operational schema with PostgreSQL primitives", () => {
    expect(postgresSchema).toContain('from "drizzle-orm/pg-core"');
    expect(postgresSchema).not.toContain('from "drizzle-orm/mysql-core"');
    expect((postgresSchema.match(/pgTable\(/g) ?? [])).toHaveLength(22);
    expect(postgresSchema).toContain('pgEnum("export_type", ["tenants", "rent", "electricity", "expenses", "selected", "complete"])');
    expect(postgresSchema).toContain('timestamp("createdAt", { withTimezone: true })');
    expect(postgresSchema).toContain('date("moveInDate", { mode: "string" })');
    expect(postgresSchema).toContain('billingMode: roomBillingMode("roomBillingMode")');
  });

  it("creates all target tables and preserves automatic update semantics", () => {
    expect((initialMigration.match(/CREATE TABLE /g) ?? [])).toHaveLength(22);
    expect(initialMigration).toContain('CREATE FUNCTION public.set_updated_at()');
    expect((initialMigration.match(/CREATE TRIGGER .*set_updated_at/g) ?? [])).toHaveLength(16);
    expect(initialMigration).toContain('CREATE UNIQUE INDEX "rent_allocation_month_unique"');
    expect(initialMigration).toContain('CREATE UNIQUE INDEX "tenant_charge_source_tenant_month_unique"');
  });

  it("locks down the application-owned trigger function without changing Supabase-managed functions", () => {
    expect(hardeningMigration).toContain('ALTER FUNCTION public.set_updated_at() SET search_path = pg_catalog;');
    expect(hardeningMigration).toContain('REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;');
    expect(hardeningMigration).not.toContain("rls_auto_enable");
  });

  it("preserves the source room billing column name through a forward-only target migration", () => {
    const roomColumnMigration = readFileSync(new URL("../drizzle-pg/migrations/0002_rename_rooms_billing_mode.sql", import.meta.url), "utf8");
    expect(roomColumnMigration).toContain('ALTER TABLE public."rooms" RENAME COLUMN "billingMode" TO "roomBillingMode";');
  });

  it("uses source physical enum-column names so the existing data layer remains compatible", () => {
    const enumColumnMigration = readFileSync(new URL("../drizzle-pg/migrations/0003_align_source_enum_column_names.sql", import.meta.url), "utf8");
    expect(postgresSchema).toContain('tenantStatus("tenantStatus")');
    expect(postgresSchema).toContain('rentStatus("rentStatus")');
    expect(postgresSchema).toContain('tenantChargeSourceType("tenantChargeSourceType")');
    expect(postgresSchema).toContain('managerNotificationKind("managerNotificationKind")');
    expect((enumColumnMigration.match(/^ALTER TABLE /gm) ?? [])).toHaveLength(30);
  });

  it("resets every imported serial sequence without exposing or changing record contents", () => {
    const sequenceMigration = readFileSync(new URL("../drizzle-pg/migrations/0004_reset_imported_id_sequences.sql", import.meta.url), "utf8");
    expect((sequenceMigration.match(/^SELECT setval\(/gm) ?? [])).toHaveLength(22);
    expect(sequenceMigration).toContain("COALESCE((SELECT MAX(id)");
    expect(sequenceMigration).toContain("pg_get_serial_sequence('public.\"staffAssignments\"', 'id')");
    expect(sequenceMigration).not.toContain("INSERT INTO");
    expect(sequenceMigration).not.toContain("UPDATE ");
  });
});
