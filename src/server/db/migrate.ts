import "../guard";
import { loadEnv } from "../config/env";

/**
 * Migrations run from Node/CI with direct DATABASE_URL access, never from Worker requests.
 * Full drizzle-kit migrate wiring lands with M2 schema; M0 only validates env readiness.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for migrations");
  }
  console.log("Migration runner placeholder — schema migrations arrive in M2.");
  console.log(`Target database configured for APP_MODE=${env.APP_MODE}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
