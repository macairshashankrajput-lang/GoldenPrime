type BuildingShareContext = {
  name: string;
  address?: string | null;
  city?: string | null;
  landmark?: string | null;
  contactPhone?: string | null;
  mapUrl?: string | null;
};

export function buildTenantAccessMessage(building: BuildingShareContext, tenantName: string) {
  return [
    `Welcome to ${building.name}, ${tenantName}.`,
    "Sign in to the Golden Prime PG resident portal with your registered mobile number and the password supplied when your account was created.",
    building.contactPhone ? `For help, contact the Building Manager: ${building.contactPhone}` : null,
    building.mapUrl ? `Building map: ${building.mapUrl}` : null,
  ].filter(Boolean).join("\n\n");
}

export function buildReminderShareMessage(building: BuildingShareContext, title: string, dueDateLabel: string, tenantName?: string) {
  return [
    `Reminder from ${building.name}`,
    tenantName ? `Hello ${tenantName},` : null,
    title,
    `Due: ${dueDateLabel}`,
    building.contactPhone ? `For help, contact the Manager: ${building.contactPhone}` : null,
  ].filter(Boolean).join("\n");
}

export function buildWhatsAppShareUrl(phone: string | null | undefined, message: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const recipient = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
}

export function buildManagerQrPayload(building: BuildingShareContext) {
  return [
    building.name,
    building.address,
    building.city,
    building.landmark ? `Landmark: ${building.landmark}` : null,
    building.contactPhone ? `Manager: ${building.contactPhone}` : null,
    building.mapUrl ? `Map: ${building.mapUrl}` : null,
  ].filter(Boolean).join("\n");
}
