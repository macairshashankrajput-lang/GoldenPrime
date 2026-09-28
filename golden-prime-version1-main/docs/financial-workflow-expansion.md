# Financial Workflow Expansion Contract

## Owner settlement and Manager credit

The percentage-based Owner share is retired from Manager-facing workflows. Each building stores an optional **fixed monthly Owner cut** in integer paise. A settlement record may override that amount for an individual billing month, preserving the agreed amount, due date, payment method, note, stored proof URL, payment status, and Owner-confirmed Manager-credit adjustment.

| Metric | Calculation | Purpose |
|---|---|---|
| Owner profit due | Monthly Owner cut or settlement amount minus Owner settlement paid amount | Shows the outstanding payment due to the Owner. |
| Manager projected credit | Projected operating result minus the agreed Owner cut plus any Owner credit adjustment | Forecast after the agreed monthly distribution. |
| Manager cash credit | Cash operating result minus actual Owner settlement paid plus any Owner credit adjustment | Cash position after recorded Owner payments. |

Owner credit adjustments are signed paise amounts and require a note. They are not operating expenses and do not alter rent, electricity, expense, or service source records.

## Building collection accounting

Tenant electricity collection is distinct from the monthly **government electricity payment**. The government bill stores total payable, paid amount, due date, payment details, proof URL, and status for one building and billing month. Collection views display rent billed, rent collected, rent pending, tenant electricity billed, tenant electricity collected, tenant electricity pending, government electricity payable, government electricity paid, and government electricity pending.

## Payment and correction controls

Manager collection rows retain typed status calculation. **Mark paid** sets paid amount to the expected amount, assigns the current date if needed, and records the chosen method. Managers can edit payment values and notes. Rent, electricity, tenant-charge, government-electricity, Owner settlement, expense, and operating-cost corrections remain auditable; deletion is available only for manually entered non-derived expense, operating-cost, government-electricity, and Owner-settlement entries. Derived monthly rent and tenant-charge records are corrected through their update actions rather than destructive deletion.

## Role scope

Tenant payment instructions display the configured building bank, account holder, account number, IFSC, UPI ID, and QR image only inside the authenticated tenant portal. The Owner interface gains building-scoped payment confirmation, Manager-credit adjustment, and Manager follow-up reminder actions. Occupancy cards expand to floor, room number, room type, vacancy status, and active resident names and phone numbers. Financial ledgers remain Manager-facing except for the Owner’s settlement and summary controls.
