# Controlled End-to-End Audit Notes

## Initial rendered session check — 2026-08-24

The published application loaded into the configured Manager session without a client rendering failure. The Buildings screen displayed the active-building selector, Manager navigation, two accessible building cards, and responsive action controls for Manage, create, share, QR, edit, and delete. This establishes the rendered Manager workspace as the browser-verification baseline for the controlled audit.

## Rendered Billing verification — 2026-08-24

The published Manager Billing screen displayed the current-month tenant and room collection cards, meter-reading form with its image-file control, and receipt-review controls. Selecting a Rent edit action scrolled directly to the populated correction form. That form exposed amount, payment method, date, payment presets, receipt URL, file upload, notes, Save rent correction, and Cancel controls. The live controlled audit independently verified the backing mutations and managed-storage upload paths with isolated records.

The rendered Manager account menu exposed a Sign out action and accepted the sign-out selection, allowing an independent tenant-session check to proceed without retaining the Manager session.

## Rendered tenant sign-in verification — 2026-08-24

After sign-out, the published application displayed only the phone-number and password sign-in form. The configured Shashank tenant credentials were accepted by the submitted sign-in form and the interface entered its authenticated transition state; the following check records the tenant-scoped destination.

## Rendered tenant portal verification — 2026-08-24

The published tenant session redirected to the resident-scoped portal for Shashank. It displayed Room 302, the individual ₹8,000 rent allocation, the tenant-only Water bottle service charge, payment-method selection, and receipt attachment actions for both allocated charges and rent. The page did not expose Manager operations. The controlled live audit separately submitted and approved a tenant receipt with an actual stored image URL in a temporary, fully cleaned account.

All live records created during the next audit phase will be tagged, isolated to a temporary building, and removed after verification. Stored upload objects will not remain referenced after the audit building is removed.

## Role workspace redesign check — 2026-08-24

The rendered Owner session now opens only the dedicated read-only summary. It showed Golden Prime PG with three rooms, two vacant rooms, one tenant, monthly Owner profit, profit due, Manager credit, the next building payment, and Owner payment history. Tenant records, bill lists, expense ledgers, receipt files, and Manager navigation were absent.

## Manager workspace redesign check — 2026-08-24

The Manager session rendered the dedicated Vacancies, Collections, Profit, and Payment receiving navigation entries. Collections showed current-month rent and tenant-service dues separately and its Rent editor exposed expected amount, due date, received amount, payment method, payment date, collection note, save, and cancel controls. The editor was opened only for visual verification; no live payment status was changed.

Payment receiving rendered a separate authenticated Manager form for bank name, account holder, account number, IFSC, UPI ID, QR URL, and a managed QR-image upload control. Profit rendered cash profit, projected profit, Owner profit due, Manager credit, a record-settlement action, and an empty payment-history state without altering live financial records.

Vacancies rendered available-capacity cards and a direct Allocate tenant action. Its first rendered handoff exposed a query-string handling issue; that was repaired before completion. The action now opens the selected room’s allocation form with tenant selection, move-in date, primary-payer selection, rent, deposit, optional services, and save/cancel controls. No allocation was submitted during verification.

## Manager sign-in report check — 2026-08-24

After explicitly signing out the existing tenant session, the published phone-password form accepted the configured Building Manager account and redirected it to the authenticated Buildings workspace. The server response and subsequent building/snapshot requests completed successfully, and the current development log review showed no authentication exception. The reported failure could not be reproduced with the configured credentials.

The configured Owner account also completed a separate published phone-password sign-in successfully. The published session displayed an application-update notice, so affected users should accept the in-app Refresh prompt before retrying rather than relying on an older installed PWA bundle.

## Financial workflow expansion check — 2026-08-24

The authenticated Manager rendered the revised Profit workspace without visible client errors. It displayed separate rent collection, tenant electricity collection, fixed Owner cut, Manager credit, government-electricity reconciliation, and Owner payment-history sections. The interface exposed dedicated Government electricity and Owner payment actions. The live summary showed rent collected ₹18,000 and Manager credit ₹18,300; no financial entry was submitted during this visual check.

## Production-wide sign-in incident reproduction — 2026-08-24

After explicit production sign-out between each account, the configured Building Manager, Shashank Tenant, and Building Owner phone-password accounts each completed a submitted sign-in and reached their respective authenticated destinations. The live runtime log query returned no recent authentication exception. The reported production-wide failure was not reproduced; stale installed PWA assets remain the most likely client-side condition when a user experiences this symptom.

## Latest workspace verification — 2026-08-24

The current Manager implementation rendered the dedicated Profit workspace with fixed Owner cut, Owner payment, government electricity, tenant electricity collection, rent collection, Manager credit, and payment-history controls. The dedicated Vacancies workspace rendered a room-type filter, five available beds across two rooms, room occupancy summaries, allocation-mode labels, and direct Allocate tenant actions. The independently tested production sign-ins for Owner, Manager, and Tenant completed successfully; production UI propagation remains under separate revalidation.

## Fixed Owner cut and tenant payment configuration verification — 2026-08-24

The Manager Settings screen now renders a fixed monthly Owner cut amount, not a percentage field. The dedicated Payment Receiving screen renders Bank name, account-holder name, account number, IFSC, UPI ID, QR URL, QR upload, and save controls, with an explicit statement that these details stay inside tenant accounts and never enter a shared property payload. No live bank or QR details are configured for Golden Prime Pg, so the Tenant portal correctly presents its empty payment-instructions state rather than fabricated payment data.

## Production propagation and limited Owner-action verification — 2026-08-24

After clearing the browser-only service-worker cache and reloading the fresh deployment, the current production Owner dashboard rendered the limited Owner controls as intended: rent and electricity collections, Owner payment history, settlement confirmation when applicable, Manager-credit adjustment and reminder forms, plus expandable room, vacancy, resident, and contact detail. The Owner session was signed out before the Manager session was signed in successfully. The Manager Building workspace exposed the dedicated Vacancies, Profit, Collections, and Payment Receiving navigation entries and the expected building management controls.

The Manager Building card still displayed a legacy `Owner share: 0%` summary despite the corrected fixed-cut forms. This display-only defect was corrected locally to `Fixed monthly Owner cut` using `ownerMonthlyCutPaise`; the full 165-test suite, TypeScript validation, and production build passed. The correction requires publication and one final live visual recheck.

The first post-publication Manager Buildings reload still returned the legacy Building-card copy from the browser's installed PWA cache. The deployment must be reloaded after clearing the browser-only service-worker cache before the live artifact is assessed.

After unregistering the service worker, deleting the browser cache, and navigating to a cache-busted release URL, the Manager Buildings page still rendered the legacy percentage summary. The final deployment artifact or its delivery route therefore remains under investigation; this has not been treated as a successful production verification.

The live origin returned the current fixed-cut artifact when requested with `cache: no-store`. Replacing the stale browser document with that current HTML made the Manager Building card render `Fixed monthly Owner cut: ₹0`, confirming that the published release is current and that the remaining mismatch was limited to the browser's previous PWA document cache.

When navigating away from the manually refreshed Manager Buildings page to Vacancies, the browser remained on its loading shell. This route transition is being diagnosed before concluding the final Manager workspace check; it is not yet classified as a production route defect.

The current artifact subsequently completed the Vacancies transition. The authenticated Manager workspace displayed its room-type selector, five available beds across two rooms, vacancy and balcony state, occupancy counts, billing-allocation labels, and direct Allocate tenant actions for Room 101 and Room 001. The initial loading shell was a readiness-timing observation, not a route failure.

The current production Profit workspace then rendered the fixed monthly Owner cut of ₹1,50,000, rent collection of ₹18,000, Manager credit of ₹18,300, tenant electricity and government-electricity reconciliation cards, and an auditable paid Owner-payment history. No financial action was submitted during this verification.

The independently authenticated Manager session was then explicitly signed out and returned to the phone-password-only login page before starting the Tenant portal check.

The configured Tenant account then signed in successfully to the current production portal. Its scoped Payment instructions section presented the correct explicit empty state because the active building has no configured bank, UPI, or QR values; it also retained payment-method selection and receipt-attachment controls. The Tenant portal showed only resident information, room and allocated-bill context, and Manager contact actions, without Manager operational access. This completes the requested Owner, Manager, and Tenant production sign-in and workspace verification for the current release.

## Local credential-recovery workspace verification — 2026-08-24

The authenticated Manager workspace rendered the new Login & recovery route. It displayed the Manager's own login-phone and current-password-confirmation form, plus the building-scoped recovery list containing the assigned Owner, Manager, and tenant accounts with their role and login phone only. Each recovery action is a replacement-password control; no stored password or password hash was rendered. No account, phone, or password change was submitted during this verification.

## Local Owner financial summary verification — 2026-08-24

After a separate Owner sign-in, the revised Owner summary rendered only the assigned Golden Prime Pg property. It displayed the recorded fixed Owner monthly settlement of ₹1,50,000, the requested `Total building electric bill` label, and rent received of ₹18,000. The previous Profit due and Manager credit cards were absent. The next payment moved to the unpaid September settlement, due 10 September 2026 for ₹1,50,000, while the paid August UPI settlement remained in history. No financial action was submitted.

The Manager Billing workspace then rendered the updated Rent correction form together with the `Remove incorrect record` panel and `Delete record` action. Its visible guidance confirmed that a recovery snapshot is retained and that paid electricity or paid tenant collections must be corrected rather than deleted. The form was opened only for visual verification; the deletion action was not selected and no financial record changed.

The Manager New building form rendered the required Building Owner account section. It exposes Owner name, Owner login phone, and an initial password field used only when creating a new Owner profile; the form explains that an existing Owner phone links the building and that current passwords are never shown. The form was not submitted, so no temporary building or Owner account was created.

## Building electricity, privacy, and correction verification — 2026-08-24

The local authenticated Manager Billing workspace rendered a new `Total building electricity bill` panel above room meter entry. It provides one auditable monthly building-utility entry, paid and remaining amounts, a direct add/edit form, and a Manager-only delete path; it remains separate from per-room meter bills and tenant collections. The same Manager page rendered the explicit `Delete incorrect bill or collection` selector with eligible rent records, plus clear correction guidance for paid dependent records.

The August duplicate full-month rent for Tanu from the vacated one-day allocation was reconciled: the valid active-allocation rent remains at ₹5,000, the redundant record was removed from current calculations, and a recovery audit snapshot was retained. Automatic cycle generation now skips a second full-month rent for a tenant who already has a building-month rent record after a non-prorated reallocation.

The independently signed-in local Owner view rendered only the fixed Owner monthly settlement, the approved monthly building-expense total, building occupancy, the next Owner settlement, and Owner payment history. Rent received, room-electricity billing, tenant dues, Manager credit, and operating-calculation cards were absent. The active building has no booked general, operating, or building-utility expense for the selected month, so the approved expense total correctly rendered ₹0.

The local Manager dashboard rendered `Building utility bill` as a separate card with total, paid, and remaining values, as well as a dedicated work-queue link to the Billing workspace. The collection overview also showed the linked utility-bill total. Its projected-profit detail now states the fixed Owner cut amount rather than a percentage. No financial data was changed during this dashboard verification.

Immediately after publication, the first normal production Billing navigation still rendered the prior installed-PWA artifact without the new building-electricity and direct-deletion panels. This has been recorded as a client-cache observation and is not treated as a failed deployment until the no-store artifact is verified.

The production origin’s current index and Billing module were inspected directly with cache-disabled requests and contained the new total-building-electricity and direct-deletion copy. The browser had retained an earlier immutable index and dynamic Billing module despite no active service-worker controller. Replacing its document with a reload/no-store fetch of the current index resolved the mismatch. The published Manager Billing route then rendered the total building electricity bill panel, direct deletion selector, the corrected ₹13,000 rent total after duplicate cleanup, and paid-entry correction guidance without changing any live financial record.

An independently signed-in production Owner session initially loaded the prior lazy Owner module against the current restricted API response, which exposed legacy labels with `₹NaN`. This is a stale dynamic-module mismatch, not accepted as the current release result; the Owner document will be reloaded from the cache-disabled current index before final verification.

The cache-refreshed production Owner module rendered correctly. It showed only Owner monthly settlement, approved monthly building expenses, occupancy, next Owner payment, payment history, and Manager follow-up. Manager collections, tenant dues, room electricity, Manager credit, and operating-calculation details were absent. The production release now passes the requested Manager Billing and Owner privacy workflow checks; the recovery snapshot log and `docs/data-isolation-and-recovery.md` provide the implemented restoration and operational backup procedure.

## Deletion confirmation and protected undo validation — 2026-08-24

The Manager financial deletion implementation now uses one accessible confirmation dialog across Billing, Collections, Expenses, and Profit. Eligible audited financial deletions return the exact audit identifier to a Manager-only restoration procedure. The procedure requires the original deleting Manager, the same building, a ten-minute window, a `deleted` audit state, a valid snapshot, and no conflicting replacement before it restores the parent record and eligible unpaid tenant-charge children. It changes the original audit action to `deleted_undone` and writes a separate `restored` audit event.

Automated validation completed successfully: the full suite passed with **34 test files and 178 tests**, including the new deletion-undo contracts; TypeScript validation passed; and the production PWA build completed. The validation covers Manager authorization, building scope, undo-window enforcement, snapshot consistency, child-record restoration, audit state transitions, and replacement-record conflict handling. No production financial record was deleted or restored during this automated validation.

## Tenant-credit definition correction — 2026-08-24

Manager reporting now defines tenant credit strictly as the **remaining positive balance** of tenant rent, tenant electricity collections, and assigned-cost collections. A fully settled bill therefore contributes zero to tenant credit; partial payments contribute only the unpaid remainder. The Dashboard and Profit workspaces label this value `Tenant credit pending` and their drill-down lists only unpaid records with direct payment actions. The previous ambiguous Manager-credit card is now labelled `Projected Manager result`, keeping operational profitability separate from tenant balances due.

Automated validation passed with **34 test files and 180 tests**, TypeScript validation, and the production PWA build. The regression contract verifies that the pending-credit total is composed from rent, electricity, and assigned-cost balances only, rather than paid collections.

## Manager Export & Filters workspace — 2026-08-24

The previous single-report CSV export screen has been replaced with a dedicated Manager **Export & Filters** workspace. It creates native Excel workbooks with separate formatted worksheets, selected data sections, date/status/outstanding-balance filters, and a complete operational building export. Manager authorization and assigned-building access are enforced before the workbook data is returned, and each request is recorded in export history.

The complete operational workbook includes building records, rooms, tenants, allocations, rent, electricity, tenant charges, expenses, operating costs, services, reminders, transfers, Owner settlements, building electricity, Manager-result adjustments, safe account roster, notifications, audit history, and export history. Passwords, password hashes, database credentials, session data, and secrets are excluded by design. The additive export-history enum migration was reviewed and applied. Validation passed with **35 test files and 184 tests**, TypeScript, and the production PWA build.

## Manager tenant-credit visual alert — 2026-08-24

The Manager dashboard now aggregates each tenant’s outstanding rent, electricity, and assigned-cost balances for the selected reporting period. Any tenant with a positive remaining balance appears in the persistent **Tenant credit watch** section using red cards, red balance chips, and a direct Collections action. The credit metric drill-down applies the same red visual treatment to each underlying unpaid record. Fully settled bills remain absent from both views.

Validation passed with **35 test files and 185 tests**, TypeScript, and the production PWA build. The regression contract verifies aggregation from all three eligible balance sources, excludes non-positive balances, and retains Manager payment navigation.

## Credit-watch follow-up actions — 2026-08-25

Each Manager credit-watch row now carries the earliest eligible due date and an exact overdue-day badge when the date has passed. The row opens a prefilled WhatsApp reminder in a separate WhatsApp session; the Manager reviews and sends the message. The **Mark payment received** shortcut opens the exact earliest unpaid rent or tenant-charge record in the existing Billing payment editor, preserving payment method, amount, receipt, review, and correction safeguards rather than silently marking financial records paid.

Validation passed with **35 test files and 186 tests**, TypeScript, and the production PWA build. The dashboard contract covers earliest-due selection, UTC overdue-day calculation, WhatsApp URL generation, and typed payment-editor navigation.

## Full workflow and mobile reliability audit — 2026-08-25

The audit covered Manager operations, Owner privacy boundaries, Tenant payment and receipt controls, offline entry states, authorization, building isolation, optimistic concurrency, accounting calculations, recovery, exports, and scheduling contracts. It identified and repaired five remaining browser-native confirmation prompts in the Building, Room/Floor, and Tenant workspaces. Every reviewed destructive Manager control now uses the shared accessible confirmation dialog; server-side history and dependency guards continue to determine whether a requested structural deletion is allowed.

The Tenant room-type filter now includes Individual and Co-living, matching the room types accepted by room creation and allocation. Responsive refinements add horizontally reachable filter controls on phones plus short, reduced-motion-aware section and card transitions. Mobile screenshots at 375 × 812 confirmed the sign-in and offline layouts remain stable without visible overflow. The final suite passed with **35 test files and 188 tests**, TypeScript, and the production PWA build.

## User-configurable motion intensity — 2026-08-25

Manager Settings now includes a **Motion and accessibility** choice with Use device setting, Minimal motion, and Standard motion. The selection is persisted locally on the current device and applied at the document root, so the existing page-entry, staggered-section, and interactive-card effects update immediately. Minimal motion suppresses decorative movement; the device-level reduced-motion preference remains honored regardless of the selected option. Validation passed with **36 test files and 191 tests**, TypeScript, and the production PWA build.

## Cross-role display preferences — 2026-08-25

Owner and Tenant profile areas now expose the same persistent Motion control as Manager Settings, with device, minimal, and standard options. Manager Settings additionally includes a compact-density mode. It adds a Manager-workspace density attribute, reduces shared table header/cell spacing, and compacts supported cards without changing Owner or Tenant layouts. Both preferences stay local to the current device. Validation passed with **36 test files and 192 tests**, TypeScript, and the production PWA build.

## Compact financial record views — 2026-08-25

The Manager compact-density preference now directly scopes Billing and Export & Filters. Billing uses a dedicated density hook around its financial workspace, while Export & Filters compacts the workbook scope cards, dataset grid, and selected-section cards. Shared Manager table density remains active, so financial data can be reviewed with less vertical space without changing the source calculations, filters, export contents, or payment safeguards. Validation passed with **36 test files and 193 tests**, TypeScript, and the production PWA build.

## Receipt queue and export field controls — 2026-08-25

Billing now places a compact pending-receipt queue ahead of the detailed review area. It shows the three newest submitted proofs with secure proof links and direct approval; rejections remain in the detailed reviewer flow where a decision note is mandatory. Export & Filters now retrieves a building-scoped preview for the selected data sections and filters, exposes per-sheet visible-field toggles, previews the chosen columns, and writes only those approved visible fields into selected workbook sheets. Complete operational exports retain their full safe operational field set. Validation passed with **36 test files and 195 tests**, TypeScript, and the production PWA build.

## TiDB-to-Supabase PostgreSQL readiness assessment — 2026-08-25

The connected Supabase target project was verified as active and healthy on PostgreSQL 17 with no `public` tables. The TiDB source remained connected and unchanged. A read-only source baseline captured 22 operational-table counts, account-role counts, primary financial aggregates, zero overpayment findings, and zero orphan findings across rooms, tenants, allocations, rent payments, and tenant charges. The source contains five users, one building, three rooms, two tenants, three allocations, two rent payments, one tenant charge, two reminders, five Manager notifications, one Owner settlement, and one change-audit record.

The assessment confirms that a connection-string swap is unsafe. The current application uses the MySQL Drizzle dialect, MySQL enums and automatic-update semantics, MySQL conflict handling, and MySQL insert identifiers. A separate PostgreSQL schema, explicit identity-ID preservation, UTC timestamp handling, update triggers, PostgreSQL conflict targets, and `returning`-based insert adaptation are required before any runtime cutover. No target DDL, data import, CLI login, CLI link, application runtime switch, or production data change occurred during this assessment. The verified migration plan is recorded in `docs/supabase-postgresql-migration-plan.md`.

## Isolated Supabase PostgreSQL schema preparation — 2026-08-25

The verified empty Supabase target now contains the reviewed 22-table PostgreSQL schema, its enum types, foreign keys, unique constraints, indexes, and 16 `updatedAt` triggers corresponding to the source MySQL automatic-update behavior. A follow-on migration set a fixed `pg_catalog` search path and revoked public, anonymous, and authenticated execution rights from the application-owned timestamp trigger function. The target remains empty: no customer, password-hash, financial, receipt, or operational records have been imported.

The Supabase schema check confirmed 22 public tables, zero `users` rows, and 16 exact timestamp triggers. The security advisor now reports only the platform-managed `rls_auto_enable` function warning plus informational RLS-without-policy notices. RLS remains enabled with no policies, so direct browser Data API access is denied by default; the existing custom server-side phone/password and building-scope authorization model remains unchanged until the dedicated PostgreSQL runtime migration is complete. The new migration regression suite passed, followed by the full suite with **37 test files and 198 tests**, TypeScript validation, and a production PWA build. TiDB remains the active production runtime.

## Idempotent TiDB-to-Supabase target load and reconciliation — 2026-08-25

The protected server-side transfer completed after a read-only code-path dry run. It imported explicit source identifiers in dependency order and was then re-run successfully to prove idempotence; no duplicate target records were created. The recorded source and target row counts match across all 22 tables: **5 users, 1 building, 1 staff assignment, 5 floors, 3 rooms, 2 tenants, 3 allocations, 2 rent payments, 1 owner settlement, 1 audit record, 1 tenant charge, 2 reminders, and 5 manager notifications**, with the remaining operational tables correctly empty.

The target reconciliation found no orphan allocations, rent payments, or tenant charges. The imported financial aggregates were retained in integer paise: rent expected and paid **1,300,000** each, tenant-charge expected and paid **30,000** each, and owner-settlement expected and paid **15,000,000** each. Imported-ID sequences were reset after load and verified to match their respective current maximum IDs. TiDB remains unchanged and continues to power the live application; the PostgreSQL target is a validated parallel data copy, not a production cutover.

## PostgreSQL data-layer adaptation and role-scope validation — 2026-08-25

The server data layer now uses the PostgreSQL Drizzle schema and an opt-in `node-postgres` pool when the server-side database selector is set to `postgres`. The migration converted MySQL duplicate-key writes to explicit PostgreSQL conflict targets, MySQL `insertId` handling to `returning` identifiers, and optimistic-concurrency checks to PostgreSQL returned-row assertions. Transactional allocation, billing, financial correction, audit, and ownership paths were preserved without exposing database credentials to the client.

The imported Supabase copy passed read-only runtime integration checks for Manager-selected building scope, Tenant portal scope, dashboard financial summaries, and the restricted Owner building summary. The complete regression suite passed with **40 files and 207 tests**, including database connection, migration, transfer, and PostgreSQL role-runtime coverage; TypeScript and the production PWA build also passed. The development server is configured for the verified PostgreSQL path. The published production artifact remains on the previous TiDB-backed checkpoint until the user explicitly authorizes the final cutover checkpoint.

## User-approved Supabase PostgreSQL production cutover — 2026-08-25

After explicit approval and a no-active-edit window, the final idempotent TiDB-to-Supabase synchronization completed successfully. The final target check confirmed **5 users, 1 building, 3 allocations, 2 rent payments, 1 tenant charge, and zero orphan allocations or rent payments**. The server-only PostgreSQL selector is now enabled for the published application. TiDB is preserved as the intact, read-only rollback source; no credentials, passwords, hashes, or transaction payloads were recorded in the release notes.

## Owner-payment and image-upload release audit — 2026-08-25

The Profit workspace now exposes the existing audited, undo-capable deletion workflow for every historical Owner-payment row, not only the currently opened month. Building creation and editing now accept a managed Building profile picture in addition to an optional URL. The upload contract includes the `building` purpose, and a live server-side storage integration test confirmed that a managed profile-image write returns the expected storage URL without exposing storage credentials.

The release audit passed **42 Vitest files and 210 tests**, including Manager, Owner, and Tenant PostgreSQL scope coverage, payment-deletion safeguards, PWA/offline contracts, billing and calculations, upload validation, a live managed-image write, and mobile sign-in rendering. TypeScript and the production PWA build passed. The audit is automated and role-scope based; the next live operational check should be a Manager's first real Building-photo upload and Owner-payment correction after release.

## Vercel production deployment and route verification — 2026-08-25

The Git-connected Vercel project now serves the Vite PWA from its correct static output directory and is publicly reachable. Vercel Authentication was disabled only after explicit user confirmation. The final production URL returned the Golden Prime PG HTML document with a `200` response, and the `/api/trpc/auth.me` path returned the expected proxied Express/tRPC response with a `200` status. The deployment rewrites API and managed-storage requests to the already validated Supabase PostgreSQL application server, preserving phone-password authentication, database access, and managed image URLs without copying credentials into Vercel.

## Supabase Storage repair and PostgreSQL operational re-audit — 2026-08-25

The previous image path wrote bytes to the Manus-managed object store rather than the user-owned Supabase project. A private `golden-prime-images` Supabase Storage bucket has now been created with a 5 MB object limit and JPG, PNG, and WEBP allow-list. New Building profile photos, room photos, meter pictures, payment QR images, and receipt proofs are uploaded only through the trusted server with the server-side Supabase secret. Database rows retain managed `/manus-storage/supabase/...` paths, and the server exchanges those paths for short-lived signed Supabase links at read time; neither browser code nor database rows contain a storage secret.

The live storage test created and read an `image/png` object in the private bucket through the managed route, returning `200 image/png`. The full suite passed **44 test files and 212 tests**, including image upload, private-bucket contract, database connection, Manager/Owner/Tenant PostgreSQL scope, payment, calculations, recovery, PWA, and synchronization coverage. TypeScript and the production PWA build passed. A direct PostgreSQL reconciliation confirmed all 22 application tables are present with the expected migrated counts, no orphan allocation, rent-payment, or tenant-charge relationships, and retained financial totals of ₹13,000 rent expected and paid, ₹300 tenant charges expected and paid, and ₹150,000 Owner settlement expected and paid. Active application screens refresh shared snapshots every 15 seconds while visible and immediately when a user returns to the tab; this is the implemented multi-device synchronization behavior.

## Supabase completeness and TiDB retirement audit — 2026-08-25

A read-only audit confirmed that the connected Supabase project is ACTIVE_HEALTHY on PostgreSQL 17.6.1. The live public schema contains all 22 migrated application tables, 65 foreign-key constraints, 22 RLS-enabled tables, 16 public update triggers, and the two expected public helper functions (`set_updated_at` and the platform-managed `rls_auto_enable` event trigger). Six Supabase migrations are applied, including the private image-bucket migration.

The current Supabase data audit returned: 5 users, 1 building, 5 floors, 3 rooms, 2 tenants, 3 allocations, 2 rent payments, 1 tenant charge, 2 reminders, 5 Manager notifications, 1 Owner settlement, 1 audit record, 1 staff assignment, and zero rows in the remaining empty operational tables. Foreign-key checks found zero orphan allocations, rent payments, or tenant charges. Financial reconciliation matched expected and paid totals: rent 1,300,000 paise, tenant charges 30,000 paise, and owner settlement 15,000,000 paise.

The private `golden-prime-images` bucket is present with a 5 MiB limit and JPEG/PNG/WEBP restrictions. Direct public and storage-schema policy lists are empty by design: RLS blocks direct Data API access, while the server-only database connection, secret-key Storage helper, and application building/role authorization enforce access. Supabase security advisors report informational RLS-without-policy notices, not an exposed-table finding.

TiDB is not completely removed from source or environment compatibility code. The active selector is `APP_DATABASE_DIALECT=postgres`, the application connects through `SUPABASE_DATABASE_URL`, and all runtime tests pass on PostgreSQL. The MySQL/TiDB adapter, `mysql2`, and legacy `DATABASE_URL` fallback remain intentionally preserved for rollback and are not the active production path. Vercel root and proxied auth endpoint both returned HTTP 200 during this audit. The full application suite passed with 46 test files and 219 tests.

## Supabase-only runtime retirement — 2026-08-25

The inactive MySQL/TiDB application path has now been removed. `server/db.ts` always initializes the PostgreSQL Drizzle client from `SUPABASE_DATABASE_URL`; it no longer reads `APP_DATABASE_DIALECT` or `DATABASE_URL`. The direct `mysql2` dependency, legacy MySQL schema directory, TiDB transfer script, and TiDB transfer contract test were removed. The reliability audit cleanup script now uses parameterized Supabase PostgreSQL queries.

The Supabase-only contract test and the complete suite passed with 46 test files and 220 tests. TypeScript validation and the production PWA build also passed. The live Supabase table-count and financial-invariant checks remain unchanged and successful. No direct browser Data API access was introduced: all public application tables remain RLS-enabled with no permissive public policies, matching the custom signed-session and server-authorization architecture.

The remote TiDB project and historical data were not deleted. They are no longer used by the application or supported tooling; deletion remains a separate destructive infrastructure action requiring an independent backup and owner authorization.

## Clean-start delivery reset — 2026-08-25

After a protected pre-reset backup and explicit owner confirmation, the Supabase clean-start SQL was executed against the Supabase PostgreSQL connection. The existing Building Manager profile was preserved unchanged: one Manager profile remains. Buildings, floors, rooms, tenants, allocations, rent payments, electricity bills, expenses, operating costs, settlements, reminders, notifications, exports, audit records, assignments, and all other operational tables now contain zero rows.

Post-reset verification passed through the direct Supabase connection. Financial totals and orphan checks are all zero, TypeScript validation passed, the full regression suite passed with 46 test files and 220 tests, and the production PWA build passed. The reset did not contact or delete the remote TiDB project. The private Storage bucket was not destructively cleared; existing objects remain managed by the bucket until a separate retention decision is made.
