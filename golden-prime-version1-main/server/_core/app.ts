import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sendOverdueRentAlerts } from "../scheduled/rentAlerts";

export function createApp() {
  const app = express();
  // Upload data URLs are validated and capped by the tRPC procedure; this
  // parser limit only prevents Express from rejecting valid 5 MB images.
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  app.post("/api/scheduled/rent-overdue-alerts", sendOverdueRentAlerts);
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext }),
  );
  return app;
}
