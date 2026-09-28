-- Golden Prime PG policy posture.
-- The application uses server-side signed sessions and never queries Supabase directly from the browser.
-- RLS is enabled on every public application table. No permissive public policies are created intentionally.
-- Server-side PostgreSQL access remains responsible for role and building authorization.

ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."buildings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staffAssignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."floors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rooms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."roomAllocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."rentPayments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenantTransfers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."electricityBills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."operatingCosts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ownerSettlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."governmentElectricityPayments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenantCharges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."serviceCharges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenantServices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."managerNotifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."exportHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."managerCreditAdjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."changeAuditLogs" ENABLE ROW LEVEL SECURITY;
