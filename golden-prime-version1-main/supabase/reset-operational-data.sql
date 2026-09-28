-- Golden Prime PG clean-start reset.
-- DESTRUCTIVE: permanently removes all buildings and operational records.
-- Preserves every existing user whose role is `manager`, including the current Building Manager profile.
-- Does not contact or delete TiDB/MySQL data.
-- Execute only after an independent backup and explicit owner confirmation.

BEGIN;

-- Buildings cascade to floors, rooms, tenants, allocations, billing, expenses,
-- reminders, notifications, settlements, assignments, and other building records.
DELETE FROM public."buildings";

-- These tables use SET NULL for building references, so remove them explicitly.
DELETE FROM public."changeAuditLogs";
DELETE FROM public."exportHistory";

-- Remove owners, tenants, helpers, cooks, and any other non-manager profiles.
-- Manager profile fields, including the password hash, are preserved unchanged.
DELETE FROM public."users"
WHERE "role" <> 'manager';

-- Keep future serial IDs valid after the clean start. The preserved Manager ID remains intact.
SELECT setval(pg_get_serial_sequence('public."users"', 'id'), COALESCE(MAX("id"), 1), COALESCE(MAX("id"), 0) > 0) FROM public."users";
SELECT setval(pg_get_serial_sequence('public."buildings"', 'id'), 1, false) FROM public."buildings";
SELECT setval(pg_get_serial_sequence('public."staffAssignments"', 'id'), 1, false) FROM public."staffAssignments";
SELECT setval(pg_get_serial_sequence('public."floors"', 'id'), 1, false) FROM public."floors";
SELECT setval(pg_get_serial_sequence('public."rooms"', 'id'), 1, false) FROM public."rooms";
SELECT setval(pg_get_serial_sequence('public."tenants"', 'id'), 1, false) FROM public."tenants";
SELECT setval(pg_get_serial_sequence('public."roomAllocations"', 'id'), 1, false) FROM public."roomAllocations";
SELECT setval(pg_get_serial_sequence('public."rentPayments"', 'id'), 1, false) FROM public."rentPayments";
SELECT setval(pg_get_serial_sequence('public."tenantTransfers"', 'id'), 1, false) FROM public."tenantTransfers";
SELECT setval(pg_get_serial_sequence('public."electricityBills"', 'id'), 1, false) FROM public."electricityBills";
SELECT setval(pg_get_serial_sequence('public."expenses"', 'id'), 1, false) FROM public."expenses";
SELECT setval(pg_get_serial_sequence('public."operatingCosts"', 'id'), 1, false) FROM public."operatingCosts";
SELECT setval(pg_get_serial_sequence('public."ownerSettlements"', 'id'), 1, false) FROM public."ownerSettlements";
SELECT setval(pg_get_serial_sequence('public."governmentElectricityPayments"', 'id'), 1, false) FROM public."governmentElectricityPayments";
SELECT setval(pg_get_serial_sequence('public."managerCreditAdjustments"', 'id'), 1, false) FROM public."managerCreditAdjustments";
SELECT setval(pg_get_serial_sequence('public."tenantCharges"', 'id'), 1, false) FROM public."tenantCharges";
SELECT setval(pg_get_serial_sequence('public."serviceCharges"', 'id'), 1, false) FROM public."serviceCharges";
SELECT setval(pg_get_serial_sequence('public."tenantServices"', 'id'), 1, false) FROM public."tenantServices";
SELECT setval(pg_get_serial_sequence('public."reminders"', 'id'), 1, false) FROM public."reminders";
SELECT setval(pg_get_serial_sequence('public."managerNotifications"', 'id'), 1, false) FROM public."managerNotifications";
SELECT setval(pg_get_serial_sequence('public."exportHistory"', 'id'), 1, false) FROM public."exportHistory";
SELECT setval(pg_get_serial_sequence('public."changeAuditLogs"', 'id'), 1, false) FROM public."changeAuditLogs";

DO $$
DECLARE
  manager_count integer;
  building_count integer;
  operational_count integer;
BEGIN
  SELECT count(*) INTO manager_count FROM public."users" WHERE "role" = 'manager';
  SELECT count(*) INTO building_count FROM public."buildings";
  SELECT
    (SELECT count(*) FROM public."floors")
    + (SELECT count(*) FROM public."rooms")
    + (SELECT count(*) FROM public."tenants")
    + (SELECT count(*) FROM public."roomAllocations")
    + (SELECT count(*) FROM public."rentPayments")
    + (SELECT count(*) FROM public."electricityBills")
    + (SELECT count(*) FROM public."expenses")
    + (SELECT count(*) FROM public."operatingCosts")
    + (SELECT count(*) FROM public."ownerSettlements")
    + (SELECT count(*) FROM public."governmentElectricityPayments")
    + (SELECT count(*) FROM public."managerCreditAdjustments")
    + (SELECT count(*) FROM public."tenantCharges")
    + (SELECT count(*) FROM public."serviceCharges")
    + (SELECT count(*) FROM public."tenantServices")
    + (SELECT count(*) FROM public."reminders")
    + (SELECT count(*) FROM public."managerNotifications")
    + (SELECT count(*) FROM public."tenantTransfers")
    + (SELECT count(*) FROM public."staffAssignments")
    + (SELECT count(*) FROM public."exportHistory")
    + (SELECT count(*) FROM public."changeAuditLogs")
    INTO operational_count;

  IF manager_count < 1 THEN
    RAISE EXCEPTION 'Reset verification failed: no Manager profile remains.';
  END IF;
  IF building_count <> 0 OR operational_count <> 0 THEN
    RAISE EXCEPTION 'Reset verification failed: operational records remain.';
  END IF;
END $$;

COMMIT;

-- Expected post-reset result: manager_count >= 1, buildings = 0, operational_count = 0.
SELECT "id", "name", "phone", "role" FROM public."users" WHERE "role" = 'manager' ORDER BY "id" LIMIT 50;
