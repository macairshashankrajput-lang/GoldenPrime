import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  throw new Error("SUPABASE_DATABASE_URL is not configured.");
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });

try {
  await client.connect();
  const { rows } = await client.query(`
    with counts as (
      select 'users' as table_name, count(*)::bigint as row_count from public.users union all
      select 'buildings', count(*)::bigint from public.buildings union all
      select 'staffAssignments', count(*)::bigint from public."staffAssignments" union all
      select 'floors', count(*)::bigint from public.floors union all
      select 'rooms', count(*)::bigint from public.rooms union all
      select 'tenants', count(*)::bigint from public.tenants union all
      select 'roomAllocations', count(*)::bigint from public."roomAllocations" union all
      select 'rentPayments', count(*)::bigint from public."rentPayments" union all
      select 'tenantTransfers', count(*)::bigint from public."tenantTransfers" union all
      select 'electricityBills', count(*)::bigint from public."electricityBills" union all
      select 'expenses', count(*)::bigint from public.expenses union all
      select 'operatingCosts', count(*)::bigint from public."operatingCosts" union all
      select 'ownerSettlements', count(*)::bigint from public."ownerSettlements" union all
      select 'governmentElectricityPayments', count(*)::bigint from public."governmentElectricityPayments" union all
      select 'managerCreditAdjustments', count(*)::bigint from public."managerCreditAdjustments" union all
      select 'changeAuditLogs', count(*)::bigint from public."changeAuditLogs" union all
      select 'tenantCharges', count(*)::bigint from public."tenantCharges" union all
      select 'serviceCharges', count(*)::bigint from public."serviceCharges" union all
      select 'tenantServices', count(*)::bigint from public."tenantServices" union all
      select 'reminders', count(*)::bigint from public.reminders union all
      select 'managerNotifications', count(*)::bigint from public."managerNotifications" union all
      select 'exportHistory', count(*)::bigint from public."exportHistory"
    )
    select table_name, row_count from counts order by table_name;
  `);
  console.log(JSON.stringify(rows));
} finally {
  await client.end().catch(() => undefined);
}
