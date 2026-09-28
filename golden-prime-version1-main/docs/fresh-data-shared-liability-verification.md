# Fresh Data and Shared-Liability Verification

The database reset removed all demo buildings, rooms, tenants, allocations, rent payments, electricity bills, expenses, operating costs, reminders, notifications, and tenant charges. Owner and Manager login accounts remain available so the application begins in a true first-run state.

The authenticated Manager workspace was verified after the reset. Billing now presents the first-building setup state without seeded collections. The Expenses & Operations workspace presents empty operational ledgers and an expense form with explicit **Building pays**, **Split between room occupants**, and **One assigned tenant pays** liability choices. Selecting room sharing requires an occupied-room choice and does not fabricate an occupant.

At a 390×844 viewport, unauthenticated routing retained a readable, touch-friendly phone/password login interface. TypeScript validation and the complete Vitest suite were run after the shared-liability implementation; the suite passed with 91 tests.
