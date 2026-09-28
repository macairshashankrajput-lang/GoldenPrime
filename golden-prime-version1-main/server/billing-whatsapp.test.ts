import { describe, expect, it } from "vitest";
import { buildReminderShareMessage, buildWhatsAppShareUrl } from "../shared/sharing";

describe("Billing pending-rent WhatsApp reminder contract", () => {
  it("builds the tenant-specific link used by a pending rent action", () => {
    const building = { name: "Golden Prime PG", contactPhone: "7668992940" };
    const message = buildReminderShareMessage(building, "Rent due · 2026-09", "05 Sep 2026", "Shashank");
    const url = buildWhatsAppShareUrl("6307500844", message);

    expect(url).toContain("https://wa.me/916307500844?text=");
    expect(decodeURIComponent(url ?? "")).toContain("Hello Shashank,\nRent due · 2026-09\nDue: 05 Sep 2026");
    expect(decodeURIComponent(url ?? "")).toContain("For help, contact the Manager: 7668992940");
  });

  it("does not create a link when the pending-rent tenant lacks a phone number", () => {
    expect(buildWhatsAppShareUrl(null, "Rent due · 2026-09")).toBeNull();
  });
});
