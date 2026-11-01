import "../guard";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Minimal placeholder schema for M0 toolchain proof. Full tables land in M2. */
export const healthChecks = pgTable("health_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
