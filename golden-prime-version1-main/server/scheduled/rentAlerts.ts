import type { Request, Response } from "express";
import { ensureMonthlyRentCycles, formatRentMonth, getUnnotifiedOverdueRentPayments, markRentPaymentsOverdueNotified, refreshManagerCollectionNotifications } from "../db";
import { notifyOwner } from "../_core/notification";

export async function sendOverdueRentAlerts(req: Request, res: Response) {
  try {
    const { sdk } = await import("../_core/sdk");
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const today = new Date().toISOString().slice(0, 10);
    const cycles = await ensureMonthlyRentCycles({ rentMonth: formatRentMonth(new Date()) });
    const notifications = await refreshManagerCollectionNotifications({ today });
    const overduePayments = await getUnnotifiedOverdueRentPayments(today);
    if (overduePayments.length === 0) {
      return res.json({ ok: true, notified: 0, cycles, notifications, skipped: "no-unnotified-overdue-rent" });
    }

    const totalBalancePaise = overduePayments.reduce((total, payment) => total + Math.max(payment.expectedAmountPaise - payment.paidAmountPaise, 0), 0);
    const sent = await notifyOwner({
      title: `${overduePayments.length} overdue PG rent ${overduePayments.length === 1 ? "payment" : "payments"}`,
      content: `Outstanding balance: ₹${(totalBalancePaise / 100).toLocaleString("en-IN")}. Open Golden Prime PG to review overdue collections.`,
    });

    if (!sent) {
      return res.status(503).json({ error: "owner-notification-unavailable", notified: 0 });
    }

    await markRentPaymentsOverdueNotified(overduePayments.map(payment => payment.id));
    return res.json({ ok: true, notified: overduePayments.length, cycles, notifications });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "unknown-error",
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}
