import { describe, expect, it } from "vitest";
import { hashPassword, normalizePhone, toSafeUser, verifyPassword } from "./auth";

describe("phone-password authentication", () => {
  it("normalizes common phone number formats to a ten-digit login key", () => {
    expect(normalizePhone("+91 99906 36862")).toBe("9990636862");
    expect(normalizePhone("7668992940")).toBe("7668992940");
  });

  it("verifies only the matching password against a salted scrypt hash", () => {
    const storedHash = hashPassword("test-password");
    expect(verifyPassword("test-password", storedHash)).toBe(true);
    expect(verifyPassword("incorrect-password", storedHash)).toBe(false);
  });

  it("strips password hashes from users returned to the client", () => {
    const safeUser = toSafeUser({ id: 1, openId: "phone:1", name: "Test", email: null, phone: "9999999999", passwordHash: "private", loginMethod: "phone-password", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() });
    expect(safeUser).not.toHaveProperty("passwordHash");
  });
});
