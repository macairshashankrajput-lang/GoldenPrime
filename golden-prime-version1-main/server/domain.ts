export type RentStatus = "paid" | "pending" | "partial";

export function deriveRentStatus(expectedAmountPaise: number, paidAmountPaise: number): RentStatus {
  if (!Number.isInteger(expectedAmountPaise) || expectedAmountPaise <= 0) {
    throw new Error("Expected rent must be a positive whole number of paise.");
  }
  if (!Number.isInteger(paidAmountPaise) || paidAmountPaise < 0) {
    throw new Error("Paid rent must be a non-negative whole number of paise.");
  }
  if (paidAmountPaise === 0) return "pending";
  if (paidAmountPaise >= expectedAmountPaise) return "paid";
  return "partial";
}

export function deriveTenantChargeStatus(expectedAmountPaise: number, paidAmountPaise: number) {
  if (!Number.isInteger(expectedAmountPaise) || expectedAmountPaise <= 0) throw new Error("Expected tenant charge must be a positive whole number of paise.");
  if (!Number.isInteger(paidAmountPaise) || paidAmountPaise < 0) throw new Error("Paid tenant charge must be a non-negative whole number of paise.");
  if (paidAmountPaise === 0) return "pending" as const;
  return paidAmountPaise >= expectedAmountPaise ? "paid" as const : "partial" as const;
}

export function splitPaiseEvenly(totalPaise: number, recipientCount: number) {
  if (!Number.isInteger(totalPaise) || totalPaise < 0) throw new Error("Amount to split must be a non-negative whole number of paise.");
  if (!Number.isInteger(recipientCount) || recipientCount < 1) throw new Error("At least one active room occupant is required to split an amount.");
  const baseShare = Math.floor(totalPaise / recipientCount);
  const remainder = totalPaise % recipientCount;
  return Array.from({ length: recipientCount }, (_, index) => baseShare + (index < remainder ? 1 : 0));
}

export function calculateRoomRentTotal(tenantRentPaise: number[]) {
  if (tenantRentPaise.length === 0) return 0;
  return tenantRentPaise.reduce((total, rentPaise) => {
    if (!Number.isInteger(rentPaise) || rentPaise <= 0) throw new Error("Each active tenant rent must be a positive whole number of paise.");
    return total + rentPaise;
  }, 0);
}

export function calculateTransferProration(sourceMonthlyRentPaise: number, destinationMonthlyRentPaise: number, effectiveDate: string) {
  if (!Number.isInteger(sourceMonthlyRentPaise) || sourceMonthlyRentPaise <= 0 || !Number.isInteger(destinationMonthlyRentPaise) || destinationMonthlyRentPaise <= 0) {
    throw new Error("Both source and destination monthly rents must be positive whole numbers of paise.");
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(effectiveDate)) throw new Error("Choose a valid transfer date.");
  const date = new Date(`${effectiveDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== effectiveDate) throw new Error("Choose a valid transfer date.");
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  const sourceDays = date.getUTCDate() - 1;
  const destinationDays = daysInMonth - sourceDays;
  if (sourceDays < 1) throw new Error("Proration is only needed when the transfer occurs after the first day of the month.");
  return {
    rentMonth: effectiveDate.slice(0, 7),
    daysInMonth,
    sourceDays,
    destinationDays,
    sourceExpectedAmountPaise: Math.round((sourceMonthlyRentPaise * sourceDays) / daysInMonth),
    destinationExpectedAmountPaise: Math.round((destinationMonthlyRentPaise * destinationDays) / daysInMonth),
  };
}

export type RoomType = "single" | "double" | "triple" | "four" | "individual" | "coliving";
export type RoomBillingMode = "equal_split" | "manager_set" | "primary_payer";

export function getRoomCapacityForType(roomType: RoomType, individualCapacity = 2) {
  if (roomType === "single") return 1;
  if (roomType === "double" || roomType === "coliving") return 2;
  if (roomType === "triple") return 3;
  if (roomType === "four") return 4;
  return Math.min(Math.max(Math.trunc(individualCapacity), 2), 12);
}

export function getDefaultBillingModeForRoomType(roomType: RoomType): RoomBillingMode {
  return roomType === "individual" ? "manager_set" : roomType === "coliving" ? "primary_payer" : "equal_split";
}

export function getDashboardPeriod(mode: "monthly" | "yearly", referenceDate = new Date(), periodKey?: string) {
  if (periodKey) {
    if (mode === "monthly" && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey)) {
      return { key: periodKey, label: new Date(`${periodKey}-01T00:00:00.000Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) };
    }
    if (mode === "yearly" && /^\d{4}$/.test(periodKey)) return { key: periodKey, label: periodKey };
    throw new Error("Choose a valid reporting month or year.");
  }
  const year = referenceDate.getUTCFullYear();
  if (mode === "yearly") return { key: String(year), label: String(year) };
  const month = String(referenceDate.getUTCMonth() + 1).padStart(2, "0");
  return { key: `${year}-${month}`, label: referenceDate.toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }) };
}

export function calculateElectricityBill(
  previousReading: number,
  currentReading: number,
  ratePerUnitPaise: number,
) {
  if (!Number.isInteger(previousReading) || previousReading < 0) {
    throw new Error("Previous meter reading must be a non-negative whole number.");
  }
  if (!Number.isInteger(currentReading) || currentReading < previousReading) {
    throw new Error("Current meter reading cannot be less than the previous reading.");
  }
  if (!Number.isInteger(ratePerUnitPaise) || ratePerUnitPaise < 0) {
    throw new Error("Electricity rate must be a non-negative whole number of paise.");
  }

  const unitsConsumed = currentReading - previousReading;
  return { unitsConsumed, billAmountPaise: unitsConsumed * ratePerUnitPaise };
}

export function getRoomOccupancy(capacity: number, activeAllocationCount: number) {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error("Room capacity must be at least one.");
  }
  if (!Number.isInteger(activeAllocationCount) || activeAllocationCount < 0) {
    throw new Error("Active allocation count cannot be negative.");
  }

  const availableBeds = Math.max(capacity - activeAllocationCount, 0);
  return {
    status: activeAllocationCount > 0 ? "occupied" as const : "vacant" as const,
    availableBeds,
    isFull: availableBeds === 0,
  };
}

export function assertTenantCanReceiveAllocation(activeAllocationCount: number) {
  if (!Number.isInteger(activeAllocationCount) || activeAllocationCount < 0) {
    throw new Error("Active allocation count cannot be negative.");
  }
  if (activeAllocationCount > 0) {
    throw new Error("A tenant can have only one active room allocation at a time.");
  }
}

export function isDateOverdue(dueDate: string, today = new Date().toISOString().slice(0, 10)) {
  return dueDate < today;
}

export function calculateBuildingFinancials(input: { expectedRentPaise: number; collectedRentPaise: number; monthlyExpensePaise: number; monthlyServiceChargeExpectedPaise: number; expectedTenantChargeRecoveryPaise?: number; collectedTenantChargeRecoveryPaise?: number; ownerSettlementPaidPaise?: number }) {
  const outstandingRentPaise = Math.max(input.expectedRentPaise - input.collectedRentPaise, 0);
  const expectedTenantChargeRecoveryPaise = input.expectedTenantChargeRecoveryPaise ?? 0;
  const collectedTenantChargeRecoveryPaise = input.collectedTenantChargeRecoveryPaise ?? 0;
  const ownerSettlementPaidPaise = input.ownerSettlementPaidPaise ?? 0;
  return {
    outstandingRentPaise,
    cashOperatingResultPaise: input.collectedRentPaise + collectedTenantChargeRecoveryPaise - input.monthlyExpensePaise - ownerSettlementPaidPaise,
    projectedOperatingResultPaise: input.expectedRentPaise + input.monthlyServiceChargeExpectedPaise + expectedTenantChargeRecoveryPaise - input.monthlyExpensePaise,
  };
}

export function calculateManagerOperatingResult(projectedOperatingResultPaise: number, ownerCutPercent: number) {
  if (!Number.isInteger(projectedOperatingResultPaise)) {
    throw new Error("Projected operating result must be a whole number of paise.");
  }
  if (!Number.isInteger(ownerCutPercent) || ownerCutPercent < 0 || ownerCutPercent > 100) {
    throw new Error("Owner share must be a whole percentage from 0 to 100.");
  }
  const ownerCutPaise = Math.round((projectedOperatingResultPaise * ownerCutPercent) / 100);
  return { ownerCutPaise, managerOperatingResultPaise: projectedOperatingResultPaise - ownerCutPaise };
}
