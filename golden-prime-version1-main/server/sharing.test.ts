import { describe, expect, it } from "vitest";
import { buildManagerQrPayload, buildReminderShareMessage, buildTenantAccessMessage, buildWhatsAppShareUrl } from "../shared/sharing";

const building = { name: "Golden Prime PG", address: "Sector 62", city: "Noida", landmark: "Near Metro", contactPhone: "9990636862", mapUrl: "https://maps.example.com/golden-prime" };

describe("selected-building sharing messages", () => {
  it("builds a tenant access message without exposing a password", () => {
    const message = buildTenantAccessMessage(building, "Shashank");
    expect(message).toContain("Welcome to Golden Prime PG, Shashank.");
    expect(message).toContain("9990636862");
    expect(message).not.toMatch(/password[:=]\s*[^\s]/i);
  });

  it("builds a share-ready reminder with the tenant, due date, and Manager contact", () => {
    expect(buildReminderShareMessage(building, "Electricity due · Room 101", "10 Aug 2026", "Shashank")).toContain("Hello Shashank,\nElectricity due · Room 101\nDue: 10 Aug 2026\nFor help, contact the Manager: 9990636862");
  });

  it("builds a scannable Manager QR payload from selected-building contact details", () => {
    expect(buildManagerQrPayload(building)).toBe("Golden Prime PG\nSector 62\nNoida\nLandmark: Near Metro\nManager: 9990636862\nMap: https://maps.example.com/golden-prime");
  });

  it("builds a WhatsApp deep link for a tenant without using an external provider", () => {
    expect(buildWhatsAppShareUrl("63075 00844", "Rent due · August")).toBe("https://wa.me/916307500844?text=Rent%20due%20%C2%B7%20August");
    expect(buildWhatsAppShareUrl("+91 63075 00844", "Hello")).toBe("https://wa.me/916307500844?text=Hello");
    expect(buildWhatsAppShareUrl("", "Hello")).toBeNull();
  });
});
