import { TRPCError } from "@trpc/server";
import { createTenantSupportRequest, getTenantPortal, submitTenantPaymentReceipt } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";

const storedReceiptUrl = z.union([
  z.string().url().max(1000),
  z.string().regex(/^\/manus-storage\/[A-Za-z0-9][A-Za-z0-9._/-]*$/, "Use a valid uploaded receipt URL.").max(1000),
]);

export const tenantRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "tenant") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Tenant access is required." });
    }
    const portal = await getTenantPortal(ctx.user.id);
    if (!portal) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant profile is not linked to this login." });
    return portal;
  }),
  requests: router({
    create: protectedProcedure.input(z.object({ category: z.enum(["maintenance", "payment", "room", "other"]), description: z.string().trim().min(8).max(500) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "tenant") throw new TRPCError({ code: "FORBIDDEN", message: "Tenant access is required." });
      try {
        await createTenantSupportRequest({ userId: ctx.user.id, ...input });
        return { success: true } as const;
      } catch (error) {
        throw new TRPCError({ code: "NOT_FOUND", message: error instanceof Error ? error.message : "Tenant profile is not linked to this login." });
      }
    }),
  }),
  payments: router({
    submitReceipt: protectedProcedure.input(z.object({ type: z.enum(["rent", "electricity", "tenant_charge"]), billId: z.number().int().positive(), paymentMethod: z.enum(["cash", "upi", "bank_transfer"]), receiptUrl: storedReceiptUrl })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "tenant") throw new TRPCError({ code: "FORBIDDEN", message: "Tenant access is required." });
      try {
        return await submitTenantPaymentReceipt({ userId: ctx.user.id, type: input.type, billId: input.billId, paymentMethod: input.paymentMethod, receiptUrl: input.receiptUrl });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Payment receipt could not be submitted." });
      }
    }),
  }),
});
