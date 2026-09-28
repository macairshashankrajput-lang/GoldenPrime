# Golden.pdf service-charge boundary

Golden Prime PG currently supports building-level operating expenses through the Expenses workflow, including recurring operational categories already represented by the existing schema such as groceries, utilities, maintenance, salaries, water, and tiffin. Those entries are included in the selected-building dashboard expense total and net operating result.

The current schema does not contain a tenant-linked recurring service-charge table with billing cycles, charge rates, invoices, or collection status. Adding that feature safely requires a schema migration and a defined policy for whether charges belong to a tenant, room, or building. No fake or ambiguous service-charge records were introduced. The current supported workflow remains building-level expense recording until that policy is approved.
