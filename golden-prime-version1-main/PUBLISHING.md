# Publishing Golden Prime PG

The current release checkpoint is **`e4d54de1`**. To host the mobile-first application on the managed free environment, open the project management panel and select **Publish**. The managed service builds the application and provides its public URL; no Vercel, Netlify, or Render configuration is required.

After the deployment is live, return to this task and confirm publication. The daily managed schedule can then be enabled for the secure `/api/scheduled/rent-overdue-alerts` endpoint. It will notify the Owner about newly overdue rent without sending duplicate alerts. The scheduled endpoint and idempotent database tracking are included in this release, but the schedule itself must only be created after the live URL exists.

The daily overdue-rent Owner alert is active at **9:00 AM India time** with schedule ID **`Y87aEQmphdf5JQkXqZyzPU`**. It can be inspected, paused, resumed, or removed from the project schedule controls.

The application now uses phone-number and password authentication exclusively. Before sharing access with staff, the Owner should sign in using the registered Owner account, review the preconfigured building, room, tenant, paid August rent, and electricity bill, then assign any additional Manager, Helper, or Cook users through the Team screen.
