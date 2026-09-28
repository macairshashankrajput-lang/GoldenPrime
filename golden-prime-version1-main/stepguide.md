# Golden Prime PG — Setup and Delivery Step Guide

This guide explains how to configure, restore, reset, and deploy Golden Prime PG after exporting the repository as a ZIP or importing it into a new Git repository.

## 1. Application architecture

Golden Prime PG is a React/Vite PWA with an Express/tRPC server. Supabase PostgreSQL is the only supported application database. The browser talks to the application server; it does not connect directly to Supabase with database credentials. Images are stored in the private `golden-prime-images` Supabase Storage bucket and are delivered through server-issued short-lived signed URLs.

The repository contains the PostgreSQL source schema at `drizzle-pg/schema.ts`, ordered migrations at `drizzle-pg/migrations/`, a complete concatenated schema bundle at `supabase/schema.sql`, the complete client-handoff bundle at `supabase/complete-migration.sql`, the intentional server-mediated RLS posture at `supabase/policies.sql`, and the Storage export at `supabase/storage-policies.sql`.

## 2. Required environment variables

Never commit `.env` files, database URLs, service-role keys, secret keys, JWT secrets, password hashes, session cookies, or API tokens. Configure these values in the deployment provider’s encrypted environment settings for development and production.

| Variable | Used by | Purpose |
|---|---|---|
| `SUPABASE_DATABASE_URL` | Server and read-only audit scripts | Supabase PostgreSQL connection string. Keep server-only. |
| `SUPABASE_URL` | Server image helper and Supabase checks | Supabase project URL. |
| `SUPABASE_SECRET_KEY` | Server image helper | Server-only Supabase Storage access. Never expose in browser code. |
| `SUPABASE_KEY` | Server-side compatibility checks | Supabase API key where required by the existing server integration. |
| `SUPABASE_JWKS_URL` | Authentication validation where configured | Supabase JWKS endpoint. |
| `JWT_SECRET` | Application server | Signs and verifies application sessions. |
| `VITE_APP_TITLE` | Browser build | Company/application display name. |
| `VITE_APP_LOGO` | Browser build | Logo URL or configured logo asset reference. |
| `OWNER_NAME` | Server seed/configuration paths | Initial administrative display name where used. |
| `OWNER_OPEN_ID` | Server configuration paths | Initial administrative identity where used. |
| `VITE_ANALYTICS_ENDPOINT` and `VITE_ANALYTICS_WEBSITE_ID` | Browser build | Optional analytics configuration. |

Use the project’s encrypted secret manager or `webdev_request_secrets` to set values. Do not place secrets in `vercel.json`, `client/`, `client/public/`, GitHub Actions logs, or documentation.

## 3. Change the company name and logo

Update the encrypted built-in variables `VITE_APP_TITLE` and `VITE_APP_LOGO`. The title is used by the browser document metadata and application shell. The logo must be a stable HTTPS URL or a project-managed asset URL; do not place large media files in `client/public/`.

After changing either value, restart the development server, run `pnpm check`, run `pnpm build`, and create a release checkpoint. For Vercel, update the same values in the project’s Production and Preview environment settings, then redeploy from the repository’s `main` branch.

## 4. Change the Building Manager login

The current preserved Manager profile is identified by the database role `manager` and must be changed through the application’s Manager/Account Security flow, not by editing a password hash manually. The Manager can update their own phone number and password from the authenticated settings screen. A password must never be written in this guide or committed to source control.

If a new Supabase project is created, preserve or create exactly one intended Manager profile through the application onboarding or an approved server-side administrative workflow. Verify phone/password login, Manager routing, building authorization, and logout after the change. Do not use Supabase Auth email/password for this application; the supported login method is the application’s phone-number/password session.

## 5. Create a new Supabase project

Create a PostgreSQL Supabase project and copy its project URL and server connection string into encrypted environment settings. Set `SUPABASE_URL`, `SUPABASE_DATABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SECRET_KEY`, and `SUPABASE_JWKS_URL` for the server environment. Do not put `SUPABASE_SECRET_KEY` or `SUPABASE_DATABASE_URL` in Vite variables.

Apply the ordered files in `drizzle-pg/migrations/` in filename order, or use `supabase/complete-migration.sql` in the Supabase SQL editor. The complete bundle includes schema DDL, database RLS enablement, the private `golden-prime-images` bucket configuration, and the current `storage.objects` policy inventory. The application server must be the only component that writes objects or creates signed read URLs. `supabase/storage-policies.sql` can be applied separately when only Storage needs to be reconstructed.

The PostgreSQL migration files are the source of truth for schema reconstruction. `drizzle-pg/schema.ts` is the application type/schema contract. Do not use old MySQL/TiDB schema files or `DATABASE_URL`.

## 6. Verify a new database before first login

From the repository root, install dependencies with `pnpm install`, then run `pnpm check`, `pnpm test -- --run`, and `pnpm build`. With the new Supabase environment loaded, run `node scripts/audit-supabase-runtime.mjs`, `node scripts/verify-supabase-financial-invariants.mjs`, and `node scripts/export-supabase-handoff.mjs`. The audit scripts are read-only; the handoff exporter writes only local SQL and manifest artifacts.

Confirm that all expected public tables exist, foreign-key and financial checks pass, RLS is enabled on every application table, and no permissive public policy was added accidentally. Confirm that the private Storage bucket exists and that a protected image upload returns a managed `/manus-storage/supabase/...` URL.

## 7. Clean-start reset for the current project

The requested delivery reset removes all buildings and operational records, including rooms, floors, tenants, allocations, bills, payments, expenses, reminders, notifications, exports, settlements, audit rows, and manager assignments. It then removes all user profiles except the existing user whose role is `manager`. The remote TiDB project is not involved.

The reviewed SQL is saved at `supabase/reset-operational-data.sql`. It is intentionally not executed automatically. Take an independent backup first, verify the manager row, and obtain owner confirmation immediately before execution because this operation is destructive and irreversible.

After the reset, verify that one Manager profile remains, all operational tables are empty, the Manager can log in, and the Manager can create a new building, floors, rooms, tenants, bills, expenses, and receipts.

## 8. Local development

Run `pnpm install` and `pnpm dev`. The server port is assigned by the project environment; do not hardcode a production port. Use `pnpm check`, `pnpm test -- --run`, and `pnpm build` before every release. Never run migration SQL against production without reviewing the SQL and taking a backup.

## 9. Deployment

Push the repository’s `main` branch to GitHub. The connected Vercel project builds the Vite PWA from `dist/public`. Vercel serves the frontend and proxies `/api/*` and `/manus-storage/*` to the managed application backend. Keep server secrets on the backend; the Vercel static frontend does not need `SUPABASE_SECRET_KEY` or `SUPABASE_DATABASE_URL`.

After deployment, verify the public PWA root, `/api/trpc/auth.me`, phone/password login, Manager building selection, and a signed managed image URL. Check server logs for runtime errors without printing environment variables. PWA icons and the empty-building fallback are local static assets, so their availability does not depend on Storage. Missing managed objects should return 404; a 502 indicates a real upstream storage failure that requires investigation.

The server pool defaults to eight PostgreSQL clients, below the managed Supabase session limit, with connection and idle timeouts. `SUPABASE_POOL_MAX` may be set between 2 and 12 when capacity is confirmed. The permanent-Manager concurrency harness re-authenticates each simulated device and should remain bounded by the active Supabase session pool.

## 10. Files to review after importing the ZIP

| File or directory | Why it matters |
|---|---|
| `stepguide.md` | This setup, reset, credential, migration, and deployment guide. |
| `drizzle-pg/schema.ts` | Complete PostgreSQL application schema contract. |
| `drizzle-pg/migrations/` | Ordered PostgreSQL DDL, trigger hardening, column alignment, and sequence reset migrations. |
| `supabase/schema.sql` | Portable concatenated schema SQL bundle. |
| `supabase/policies.sql` | RLS enablement and intentional server-mediated policy posture. |
| `supabase/complete-migration.sql` | Complete schema, database RLS, private Storage bucket, and current object-policy handoff SQL. |
| `supabase/storage-policies.sql` | Storage bucket configuration and current `storage.objects` policy export. |
| `supabase/handoff-manifest.json` | Machine-readable bucket and policy inventory. |
| `supabase/reset-operational-data.sql` | Reviewed destructive clean-start reset script; execute only after confirmation. |
| `scripts/backup-supabase-before-reset.mjs` | Read-only protected JSON backup utility for pre-reset recovery. |
| `scripts/execute-clean-start-reset.mjs` | Target-checked executor and post-reset verifier for the confirmed clean start. |
| `scripts/audit-supabase-runtime.mjs` | Read-only table-count audit. |
| `scripts/verify-supabase-financial-invariants.mjs` | Read-only relationship and financial reconciliation. |
| `scripts/export-supabase-handoff.mjs` | Regenerates complete migration SQL, Storage policies, and the handoff manifest. |
| `scripts/load-test-multi-device-sync.mjs` | Re-authenticated Manager load test for protected workspace routes. |
| `server/db.ts` | Supabase PostgreSQL runtime data layer. |
| `server/supabaseStorage.ts` | Server-only private Supabase Storage integration. |
| `vercel.json` | Frontend build and backend/image proxy rules. |
| `package.json` and `pnpm-lock.yaml` | Dependency and build contract. |

## 11. CSV and analytics operations

The Manager Dashboard includes a live occupancy and revenue widget. Occupancy uses active tenant allocations and open beds in the selected building; revenue uses the selected reporting period’s collected rent. The Manager Export screen provides building-scoped `Rooms CSV` and `Tenants CSV` downloads. CSV cells are escaped and formula-like values are prefixed to prevent spreadsheet formula injection. Authentication secrets, password hashes, session data, and database credentials are never exported.

To run the protected multi-user validation against the permanent Manager profile, set `LOAD_TEST_MANAGER_PHONE` or `LOAD_TEST_MANAGER_USER_ID` and run `LOAD_TEST_DEVICES=3 LOAD_TEST_CYCLES=3 node scripts/load-test-multi-device-sync.mjs`. A pre-issued session cookie may be supplied as `LOAD_TEST_MANAGER_TOKEN`; the token is never printed. The script creates and removes only a temporary QA building and performs no financial mutations. Keep device concurrency bounded by the active Supabase session-pool capacity.

## 12. Security rules

Do not expose or commit Supabase secret keys, database connection strings, password hashes, session secrets, or personal credentials. Do not add permissive `anon` or `authenticated` policies unless the application is redesigned to use direct browser Supabase access and each policy is reviewed. Do not delete the external TiDB project until an independent backup and restore test has succeeded and the owner has approved its destruction.
