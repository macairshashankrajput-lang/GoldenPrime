# Role Workspace Redesign Contract

## Manager workspaces

The Manager workspace will use dedicated routes rather than combining unrelated operations in tenant and room cards. **Collections** will be the sole screen for rent, electricity, tenant-service, and assigned/shared-cost status updates, payment amounts, payment methods, receipt links, due dates, and notes. **Vacancies** will list rooms with available capacity and provide a direct allocation entry point. **Profit** will show period-aware cash and projected profit, Owner profit due, Manager credit, the next Owner settlement, and Owner-settlement payment history. **Payment settings** will hold the tenant-facing bank, UPI, QR, cash, and cheque receiving instructions.

## Room contracts

| Room type | Capacity | Default billing behavior | Manager control |
|---|---:|---|---|
| Single | 1 | One tenant is liable for rent and room bills. | Standard tenant rent and bill updates. |
| Double, Triple, Four sharing | 2, 3, 4 | Tenant rents remain individually agreed; electricity and room-shared costs split equally. | Standard allocation and billing controls. |
| Individual | Manager-set, 2–12 | The room default rent is reference-only; no tenant rent or shared bill is created until the Manager defines each tenant share. | Set each active resident’s rent and selectable equal/manual utility allocation. |
| Co-living | 2 | The designated primary resident is solely liable for rent, electricity, and room-shared costs. | Switch to equal allocation only through an explicit Manager action. |

Every Co-living allocation has an explicit **primary payer** flag. Existing standard room data retains its current behavior and is not silently repriced. Any allocation change affects only newly generated or explicitly updated current-period dues, preserving historical records.

## Owner settlement and summary contract

An Owner settlement records a Manager-entered expected amount, paid amount, due date, paid date, payment method (`UPI`, `Cash`, `Cheque`, or `Bank transfer`), and note. It represents an Owner payout and does not get booked as an operating expense, avoiding double-counting against the configured Owner share. The Owner summary exposes only monthly profit, remaining profit due, Manager credit, next scheduled Owner payment, completed payment history, and building occupancy facts.

## Sharing and payment privacy contract

The property Share and QR payload contains only building name, logo, full address, landmark, contact detail, and map location. It never contains rent, electricity rates, bills, tenant data, expenses, payment QR data, bank account data, Owner share, profit, or collection status. Payment-receiving details remain visible only to authenticated tenants in the relevant building.

## Owner access contract

Owner sessions use a separate, read-only interface and a restricted API. They cannot access Manager collections, tenant profiles, bills, expenses, receipt review, room allocation, payment settings, reminders, or exports. The Manager retains the operational role and full approved access to the selected building workspaces.
