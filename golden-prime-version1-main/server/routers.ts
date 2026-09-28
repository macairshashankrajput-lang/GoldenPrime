import { COOKIE_NAME } from "@shared/const";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { authenticatePhonePassword, clearPhoneSessionCookie, createPhoneSession, setPhoneSessionCookie, toSafeUser } from "./auth";
import { pgRouter } from "./routers/pg";
import { tenantRouter } from "./routers/tenant";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ? toSafeUser(opts.ctx.user) : null),
    login: publicProcedure.input(z.object({ phone: z.string().min(10).max(20), password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const user = await authenticatePhonePassword(input.phone, input.password);
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid phone number or password." });
      const token = await createPhoneSession(user);
      setPhoneSessionCookie(ctx.res, ctx.req, token);
      return toSafeUser(user);
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      clearPhoneSessionCookie(ctx.res, ctx.req);
      return { success: true } as const;
    }),
  }),
  pg: pgRouter,
  tenant: tenantRouter,
});

export type AppRouter = typeof appRouter;
