import pg from "pg";

const { Client } = pg;
const connectionString = process.env.SUPABASE_DATABASE_URL;

if (!connectionString) throw new Error("SUPABASE_DATABASE_URL is not configured.");

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10_000 });

try {
  await client.connect();
  const { rows } = await client.query(`
    select 'orphan_allocations' as check_name, count(*)::bigint as value
    from public."roomAllocations" a
    left join public.rooms r on r.id = a."roomId"
    left join public.tenants t on t.id = a."tenantId"
    where r.id is null or t.id is null
    union all
    select 'orphan_rent_payments', count(*)::bigint
    from public."rentPayments" p
    left join public."roomAllocations" a on a.id = p."allocationId"
    left join public.tenants t on t.id = p."tenantId"
    where a.id is null or t.id is null
    union all
    select 'orphan_tenant_charges', count(*)::bigint
    from public."tenantCharges" c
    left join public.tenants t on t.id = c."tenantId"
    where t.id is null
    union all
    select 'rent_expected_paise', coalesce(sum("expectedAmountPaise"), 0)::bigint from public."rentPayments"
    union all
    select 'rent_paid_paise', coalesce(sum("paidAmountPaise"), 0)::bigint from public."rentPayments"
    union all
    select 'tenant_charge_expected_paise', coalesce(sum("expectedAmountPaise"), 0)::bigint from public."tenantCharges"
    union all
    select 'tenant_charge_paid_paise', coalesce(sum("paidAmountPaise"), 0)::bigint from public."tenantCharges"
    union all
    select 'owner_settlement_expected_paise', coalesce(sum("expectedAmountPaise"), 0)::bigint from public."ownerSettlements"
    union all
    select 'owner_settlement_paid_paise', coalesce(sum("paidAmountPaise"), 0)::bigint from public."ownerSettlements"
    order by check_name;
  `);
  console.log(JSON.stringify(rows));
} finally {
  await client.end().catch(() => undefined);
}
