# Supabase-Only Database Migration Record

## Completed state

The connected Supabase project **Goldenprimepg** (`tfwlikowakkmeceoulez`) is the sole production database for Golden Prime PG. The application uses PostgreSQL through `SUPABASE_DATABASE_URL`, `drizzle-orm/node-postgres`, and the schema in `drizzle-pg/schema.ts`.

The migration completed with all 22 application tables, PostgreSQL enums, indexes, foreign keys, update triggers, imported IDs, and production rows reconciled. The active application no longer contains a MySQL/TiDB adapter, direct `mysql2` dependency, MySQL schema source, TiDB transfer script, or `DATABASE_URL` runtime fallback.

## Verification gates completed

The live Supabase database is healthy and contains 22 public tables, 65 foreign keys, 22 RLS-enabled tables, 16 update triggers, and the expected PostgreSQL helper functions. Read-only integrity checks found zero orphan allocations, rent payments, or tenant charges. Rent, tenant-charge, and Owner-settlement expected and paid totals reconcile exactly.

The private `golden-prime-images` bucket is configured with a 5 MiB limit and JPEG, PNG, and WEBP restrictions. Application storage writes and signed managed-route reads pass through the server-only Supabase Storage helper.

The full application validation suite passes with 46 test files and 220 tests, together with TypeScript validation, production PWA build, role-scope tests, PostgreSQL runtime tests, storage integration tests, and public Vercel/API connectivity checks.

## Access model

Supabase RLS is enabled on every public application table and no permissive public policies are configured. Direct anonymous or browser Data API access is therefore denied. This is intentional: the application uses its own signed phone/password sessions, server-side database credentials, role authorization, and building isolation. Supabase Auth JWT policies are not required by the current architecture.

## TiDB retirement boundary

The remote TiDB project and its historical data are not deleted by this migration. They are outside the active application path and are retained only as an external historical resource until the owner completes an independent backup and deletion decision. This repository and its supported runtime/tooling use Supabase only.

Before deleting the external TiDB project, export an independent backup, verify restoreability, record the retention decision, and confirm that no other service still depends on it.
