# WhatsApp Rent Reminder Delivery Decision

Golden Prime PG uses a **free WhatsApp-only Manager-send workflow** for rent reminders. For every pending or partial rent record, the Billing screen prepares a tenant-specific message and opens WhatsApp through a `wa.me` deep link. The Manager reviews the prefilled message and explicitly sends it. No WhatsApp Business API account, message provider, SMS sender, recurring messaging charge, or delivery callback is used.

This design does **not** send messages automatically. Automatic business-initiated WhatsApp rent reminders normally require an approved template through the WhatsApp Business Platform and may incur a charge when sent outside the recipient's active customer-service window. If automatic delivery, provider delivery status, retries, or SMS fallback are required in the future, Golden Prime PG must be upgraded to a consent-aware provider integration with the necessary approved sender/template configuration.

| Workflow | Cost to Golden Prime PG | Who sends the message | Delivery status available in the app |
| --- | --- | --- | --- |
| Current free WhatsApp action | No provider fee | Manager, after review in WhatsApp | No |
| Future provider-backed automation | Provider usage charges may apply | Application automatically | Yes, subject to provider callbacks |

The Manager must use the action only for tenants who have agreed to receive rent notices on their registered WhatsApp number. The tenant phone number is normalized to an international WhatsApp-compatible recipient link, while the reminder text contains only the selected building, tenant name, rent period, due date, and Manager contact details.

## Verification

The Billing screen was verified at an authenticated **390×844** mobile viewport using a non-persistent mocked pending-rent response. The rendered DOM confirmed the route was `/billing`, the pending state was present, and both **Create reminder** and **Open WhatsApp** controls were visible. This verification did not change any production tenant or payment record.
