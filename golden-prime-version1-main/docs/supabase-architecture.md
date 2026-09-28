# Golden Prime PG: Supabase-Only Boundary

## Current production boundary

Golden Prime PG uses the connected Supabase PostgreSQL project as the sole authoritative operational store for buildings, rooms, tenants, allocations, rent, electricity, expenses, reminders, exports, audit records, and role permissions. The active application database layer uses `drizzle-orm/node-postgres` with the server-only `SUPABASE_DATABASE_URL` connection.

All 22 application tables, PostgreSQL enums, indexes, foreign keys, update triggers, imported sequences, and migrated production rows are maintained in `drizzle-pg/schema.ts` and `drizzle-pg/migrations/`. No application request reads from or writes to TiDB/MySQL.

## Access and storage boundary

The browser communicates with the Express/tRPC server and never receives database credentials. The server enforces phone/password sessions, role checks, building isolation, and financial authorization before querying Supabase. RLS is enabled on every public application table with no permissive public policies, so direct anonymous or browser Data API access is denied. This is intentional because the application uses its own signed sessions rather than Supabase Auth JWTs.

Application images use the private `golden-prime-images` Supabase Storage bucket. The server-only secret-key helper writes validated JPEG, PNG, and WEBP objects and returns short-lived signed links through the managed image route. Supabase secrets are never embedded in browser code, Vercel static output, source control, or logs.

## Database retirement boundary

The inactive TiDB/MySQL adapter, legacy MySQL schema, direct `mysql2` dependency, source migration script, and MySQL cleanup path have been removed from the application and supported tooling. The remote TiDB project and its historical data are not deleted by this repository change; deletion requires a separate explicit request and an independent backup decision.

Any future schema change must be added to the PostgreSQL migration set, reviewed, applied to Supabase, and verified against the live application. A backup and restoration drill should be completed before deleting any historical external database.

## Credential handling

Managed variables such as `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_JWKS_URL`, and `SUPABASE_DATABASE_URL` are consumed only in their appropriate server or validation contexts. Values are not printed, committed, returned by API procedures, or placed in frontend configuration.

## Authentication boundary validation

Normal users authenticate exclusively through the application’s phone-number and password flow. Their session is signed and verified locally, and regular requests resolve the user from the Supabase-backed application database without contacting the external Manus authentication service. The remaining external authentication dependency is limited to the scheduled rent-alert callback; it is not exposed as a user login option.
