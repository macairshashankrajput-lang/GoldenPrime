# Data Isolation and Recovery Contract

## Building Boundary

Every operational record is keyed by `buildingId`. The database schema uses foreign keys from rooms, tenants, allocations, rent payments, electricity bills, expenses, operating costs, Owner settlements, government electricity payments, tenant charges, reminders, and audit records back to the assigned building. A single shared database is therefore used safely without creating separate ad-hoc folders or databases for each building.

| Actor | Permitted building scope | Enforcement point |
|---|---|---|
| Building Owner | Only records for buildings where `buildings.ownerId` matches the authenticated Owner account. | `getBuildingForUser` and `listBuildingsForUser` |
| Building Manager | Only buildings linked through `staffAssignments`. | `getBuildingForUser` and `listBuildingsForUser` |
| Tenant | Only the tenant's linked building, active allocation, bills, and payment records. | Tenant portal query helpers |

The Manager creates or links a distinct Owner profile when creating a building. The resulting building has both an Owner assignment and a separate Manager assignment. This prevents a newly added building from becoming visible in another Owner's summary or another Manager's workspace.

## Concurrent Updates

High-risk money and operational edits use optimistic concurrency checks through the record `updatedAt` timestamp. Rent, electricity, expense, operating-cost, payment-review, and allocation changes reject stale updates rather than silently overwriting data changed by another device. The client refreshes active data periodically and when the application regains focus, while critical mutations invalidate the affected building-scoped queries immediately.

## Correction and Recovery Evidence

The `changeAuditLogs` table stores a JSON snapshot before supported deletion or credential-recovery actions. It records the assigned building, entity type, entity ID, action, actor, and time. The Manager can remove incorrect rent records, unpaid electricity bills, unpaid tenant charges, general expenses, operating costs, Owner settlements, and government-electricity entries. Payments or dependent collections that would corrupt accounting remain correction-only rather than deletable.

Every Manager deletion now opens a named confirmation dialog that explains the accounting impact. Eligible financial deletions also expose an in-app **Undo** action for ten minutes. Undo is restricted to the same authenticated Manager, the same building, and the exact audit entry that recorded the deletion. The restoration process validates the snapshot, checks that no replacement record conflicts with it, restores eligible unpaid child tenant collections together with their parent record when applicable, and records both the undone deletion and the restoration in the audit trail. Service-charge configuration and protected operational-structure deletions receive the confirmation dialog but are not presented as immediate financial undo actions.

> A deletion snapshot is an application-level recovery record, not a replacement for managed database backups. It allows a controlled restoration review without exposing account passwords or password hashes.

## Operating Procedure

1. Use the in-app export workspace before major accounting changes and retain the downloaded report in the business's approved secure storage.
2. Use correction workflows for paid records. Do not delete paid electricity or tenant-collection data; update it with the supporting receipt instead.
3. For an eligible financial deletion, use the visible Undo action within ten minutes. If the undo period expires, a replacement record exists, or the original deleting Manager is unavailable, preserve the audit-log ID and request a controlled restoration review using the stored snapshot.
4. Before infrastructure changes, create a project checkpoint and verify the database migration. Managed database recovery remains subject to the database provider's retention and restore policies; no unverified retention duration is claimed by the application.

## PostgreSQL Migration Safeguard

The planned TiDB-to-Supabase PostgreSQL migration is staged and reversible. The existing TiDB database remains the production source of truth until the target schema, idempotent data dry run, row-count and financial reconciliation, phone/password sessions, role scopes, recovery undo, exports, and offline behavior have been validated. The migration copies password hashes only through a protected server-side transfer; plaintext passwords, credentials, session values, and storage object bytes are neither exported nor committed. The detailed compatibility, transfer, cutover, and rollback design is maintained in [the PostgreSQL migration plan](./supabase-postgresql-migration-plan.md).

## Manager Export and Filters

The Manager **Export & Filters** workspace produces native Excel workbooks for one currently authorized building at a time. A selected-data export can combine any chosen sections—including building profile, rooms, tenants, allocations, rent, electricity, tenant charges, expenses, operating costs, services, reminders, transfers, Owner settlements, building electricity, Manager-result adjustments, notifications, audit history, and export history—with date, status, and outstanding-balance filters. Financial sheets show billed, paid, and remaining balances as separate rupee values.

The complete operational export contains all of those building-scoped sections in separate worksheets. Its account roster is intentionally limited to account name, role, login phone, sign-in method, and timestamps. Passwords, password hashes, database credentials, session data, access tokens, and recovery secrets are never queried, returned, or written into an export workbook. This constraint preserves account security and does not weaken the existing Manager, Owner, tenant, or multi-building boundary.

## Supabase-only amendment — 2026-08-25

The migration described in the earlier recovery plan is complete. Golden Prime PG now reads and writes only to Supabase PostgreSQL. TiDB/MySQL references retained in this document describe historical migration context, not an active runtime or supported application path. The external TiDB project has not been deleted; any deletion requires an independently verified backup and a separate owner decision.
