# Manager-controlled PG operations

Golden Prime PG treats **helper and cook activity as Manager-controlled operating costs**, not as separate login accounts. The Expenses & Operations workspace records staff salary, advances, settlements, groceries, utensils, gas, cleaning, water, vendors, and maintenance work orders. Every record remains scoped to the selected building.

| Operating type | What the Manager records | Financial treatment |
|---|---|---|
| Staff | Helper or cook payee, salary, advance, settlement date, payment reference | The paid amount reduces cash result; the full commitment reduces projected result. |
| Supplies | Grocery, utensil, gas, cleaning, or water vendor and amount | Records paid and payable supply costs for the building. |
| Maintenance | Electrician, plumber, or equipment-rental job, vendor, cost, due date, and work status | Provides an open, in-progress, or complete repair follow-up alongside payment status. |

## Verification

The authenticated Manager workspace was captured at **390×844**. It rendered the active-building selector, touch-sized Expense, Operating Cost, and Service Charge actions, the operating-cost payable summary, recurring service charges, and the expense ledger with **no horizontal overflow**. TypeScript passes and the project test suite contains 80 passing tests.
