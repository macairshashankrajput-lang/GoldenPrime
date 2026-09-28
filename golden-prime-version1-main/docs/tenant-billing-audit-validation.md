# Tenant and billing audit validation

The authenticated Manager session verified the selected-building Tenant workspace. It presents **Add tenant**, **Allocate**, and **Add service** actions together with the tenant-level tiffin and water-service ledger. The workflow keeps tenant login creation, document updates, offboarding, credential revocation, and protected deletion in the same building context.

The same Manager session verified the selected-building Billing workspace. It presents rent and electricity modes with the allocation-first rent-entry flow. Expected rent is derived from the active allocation and is enforced in the server procedure, which prevents a manually entered expected-rent figure from producing incorrect rent status totals.

The authenticated Manager Billing route was re-inspected after an explicit **390px responsive test override**. It retained the active workspace selector, **Record rent**, **Rent**, and **Electricity** controls. The rent form uses active allocation selection and derives expected rent from that allocation.

The authenticated Manager Tenant route was re-inspected with the same responsive test override. It retained the active workspace selector plus **Allocate**, **Add service**, and **Add tenant** controls; the tenant-service ledger was visible. A seeded tenant card showed **Offboard** and **Delete**, with the server protecting historical allocation, rent, electricity, and reminder records from deletion.

The project screenshot runner separately captured the true **390×844** phone-number/password login layout. It does not share the authenticated browser session, so it is not represented as an authenticated Manager route verification.

Authenticated Chrome DevTools mobile emulation then captured the Manager session at a true **390×844 CSS viewport** with touch emulation enabled. The Tenant capture showed Golden Prime PG selected, Shashank's tenant card, and responsive **Edit**, **Revoke login**, **Offboard**, and **Delete** controls alongside **Allocate**, **Add service**, and **Add tenant**. The Billing capture showed the responsive rent form with active allocation selection, the non-editable allocation-derived **Expected rent** field, payment details, and the rent record. The matching electricity capture showed room selection, previous/current meter readings, due date, building rate, and **Calculate & save bill**.
