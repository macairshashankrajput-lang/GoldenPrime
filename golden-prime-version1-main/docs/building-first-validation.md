# Building-first workspace validation

The authenticated Owner/Manager entry route now redirects from `/` to `/buildings`. The Buildings screen exposes the persistent Active workspace selector, Manage action, New building action, and building card operations. Navigating to `/tenants` preserves the selected building in the workspace bar and shows tenant/allocation actions without a second page-level building switcher.

The tenant screen is ready to expose in-context tenant editing, login credential creation during onboarding, identity-document URL editing, and credential revocation for linked tenant users. The selected building remains the scope for the loaded tenant and allocation data.
