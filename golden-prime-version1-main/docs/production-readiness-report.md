# Golden Prime PG — Production Readiness Report

**Release date:** 26 August 2026  
**Application:** Golden Prime PG  
**Production URL:** https://goldenprimevercel.vercel.app  
**Managed preview:** https://goldenpg-tevhpnbb.manus.space

## Executive conclusion

Golden Prime PG is ready for delivery as a **Supabase-only, mobile-first PG management PWA**. The release includes role-based Manager, Owner, and Tenant workspaces, building-scoped operations, financial calculations, upload feedback, offline read-only snapshots, export controls, and Vercel SPA/API routing. The operational database was restored to the requested clean-start condition after UI validation: one Manager profile remains and all operational tables contain zero rows.

The test evidence supports the implemented workflows, but it also identified a capacity boundary that must remain visible to operators: the Supabase session-mode database endpoint exposes a `pool_size: 15` client limit. A bounded three-device authenticated sync run completed 18/18 requests with zero errors at 2.57 requests per second. An earlier eight-device run completed 96/96 requests with zero errors, but the subsequent concurrent test-suite workers exhausted the same session pool. Functional regression was therefore rerun serially and passed. Production traffic should use the managed connection pooler or a deliberately bounded application pool before increasing concurrency.

## Verified release surface

| Area | Evidence | Result |
|---|---|---|
| Authentication | Phone/password login route, Manager mobile session, isolated temporary Owner session and cleanup | Passed |
| Role isolation | Supabase/PostgreSQL runtime tests for Manager, Owner, and Tenant scope | Passed |
| Building operations | Building creation, editing/deletion protections, floor generation, building-scoped selection | Passed; UI-created validation building was removed |
| Rooms and tenants | Room types, capacities, sharing splits, tenant allocation, transfers, vacancy views, search/filter controls | Covered by regression and interface contracts |
| Billing and calculations | Rent status, electricity units/rates, shared and assigned charges, expenses, profit, credit, dashboards, drill-downs | Passed by regression and prior controlled reconciliation audit |
| Receipts and images | Private Supabase Storage bucket, signed managed URLs, progress/cancel/retry/dismiss state machine, receipt-review workflow | Server/storage and UI contract coverage passed; no receipt record existed for a literal UI upload in the final empty-state pass |
| Notifications | Explicit reminder-trigger requirement, idempotent reminder generation, Manager in-app notification coverage | Passed |
| Export and offline use | Selected-field export, full export safeguards, tenant/room CSV downloads, compact-density surfaces, offline snapshot age warning and reconnect refresh | Passed |
| PWA and deployment | Vite production build, generated service worker, local PWA icons, graceful missing-object responses, Vercel static output and `/api`/`/manus-storage` proxy contract | Passed |

## Validation totals

The serial regression run on 26 August 2026 passed **48 test files and 226 tests**. TypeScript validation passed. The production Vite/server build passed and generated the PWA service worker. A temporary Owner account was created, authenticated, role-checked, and deleted within the same verification script.

The clean-start reset preserved only the following user profile:

| Role | Name | Phone | Operational data after reset |
|---|---|---:|---:|
| Manager | Shivam | 7668992940 | No buildings, floors, rooms, tenants, bills, expenses, reminders, or exports |

No credentials are included in this report or the presentation. The portable credential and database procedure is documented in [`stepguide.md`](../stepguide.md).

## Load-test result

The re-authenticated load test used the permanent Manager profile, minted a 14-day Manager session token, re-authenticated all three simulated devices, and exercised `auth.me`, `pg.operations.snapshot`, and `pg.dashboard.get` with **zero financial writes**. It completed 21/21 requests with zero errors in 7.399 seconds; the 18 protected workspace requests were all successful at 2.84 requests per second, with p50 latency 1,183 ms and p95 latency 2,160 ms. The earlier inherited eight-device run completed 96 requests with zero errors at approximately 3.2 requests per second. The session-mode endpoint still reports a 15-client pool limit, so higher traffic should use Supabase’s pooler or a smaller bounded application pool.

## Delivery files

The repository contains `stepguide.md`, `supabase/schema.sql`, `supabase/policies.sql`, `supabase/complete-migration.sql`, `supabase/storage-policies.sql`, `supabase/handoff-manifest.json`, `supabase/reset-operational-data.sql`, the database backup/reset utilities, the end-to-end audit notes, and the permanent-Manager multi-device load-test script. The remote TiDB project was not deleted, but the application runtime, supported migration path, dependency tree, and environment contract contain **0% TiDB/MySQL usage**. The generated Storage export records the active private `golden-prime-images` bucket and the intentional zero-policy server-mediated posture.

## Follow-up defect resolution

The concurrent protected-route failures were addressed by bounding the application PostgreSQL pool below the managed Supabase session limit, adding connection/idle timeouts, and retrying transient session lookups before resolving a valid token. The repaired eight-device benchmark re-authenticated all devices through the permanent Manager profile and completed 104/104 requests with zero errors: 8 authentication checks plus 96 protected workspace calls, with zero financial writes. The run completed in 37.525 seconds at 2.77 requests per second; p50 latency was 3,274 ms and p95 latency was 6,280 ms.

The production storage issue was addressed in three validated layers. Missing Supabase objects resolve to HTTP 404 rather than HTTP 502 at the application storage handler, missing legacy Forge objects pass through as HTTP 404 when the upstream reports a real 404, and the PWA plus empty-building image fallbacks are local static assets. The Vercel deployment continues to use the supported managed-storage rewrite; known PWA and empty-building fallback paths no longer request removed managed objects, while genuine upstream storage failures remain distinguishable from absent optional images.

## References

[1]: ../stepguide.md "Golden Prime PG setup and deployment guide"
[2]: ../docs/end-to-end-audit-notes.md "Golden Prime PG end-to-end audit notes"
[3]: ../scripts/load-test-multi-device-sync.mjs "Multi-device authenticated sync load test"
[4]: ../scripts/execute-clean-start-reset.mjs "Clean-start operational reset utility"
[5]: ../supabase/schema.sql "Portable Supabase PostgreSQL schema"
[6]: ../supabase/complete-migration.sql "Complete Supabase migration handoff SQL"
[7]: ../supabase/storage-policies.sql "Supabase Storage bucket and object policy export"
[8]: ../supabase/handoff-manifest.json "Supabase handoff manifest"
[9]: ../server/_core/storageProxy.ts "Storage proxy missing-object handling"
[10]: ../vercel.json "Vercel API and managed-storage rewrites"
[11]: ../server/supabaseStorage.ts "Supabase signed image URL handling"


## Billing and historical-entry release update

The Billing workspace now has a persistent calendar month selector that drives rent, electricity, meter-reading, building-electricity, and tenant-status summaries. Managers can switch between Rent, Electricity, Other expenses, and Collection status from shared category controls. Other expenses opens the existing expense ledger with the selected month prefilled, while Collections preserves the selected month through its URL state.

Rent, electricity, and tenant-charge updates continue to use building-scoped optimistic concurrency checks. When another device changes a record, the UI refreshes the latest snapshot and presents a review-and-retry banner instead of only showing an opaque error toast. Collection payment updates also refresh linked electricity totals and dashboard/profit snapshots so downstream calculations remain synchronized.

Validation for this update passed TypeScript checks, 48 serial regression test files with 229 tests including three intentional skips, production build generation, and mobile route rendering checks. Unauthenticated mobile route captures correctly resolved to the phone/password sign-in guard; protected workspace rendering requires the Manager session.
