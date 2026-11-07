import { Hono } from "hono";
import { createProofUiStreamResponse, runProofPipeline } from "../server/agent/proof-pipeline";
import { createAppContext, type AppContext } from "../server/app-context";
import { loadEnv, tryLoadEnv } from "../server/config/env";
import { mountApiRoutes } from "../server/http/routes";
import type { WorkerBindings } from "./bindings";

export type { WorkerBindings };

let boot: Promise<{ ctx: AppContext; api: Hono }> | null = null;

async function bootApp(bindings?: WorkerBindings): Promise<{ ctx: AppContext; api: Hono }> {
  if (!boot) {
    boot = (async () => {
      const env = loadEnv({
        APP_MODE: bindings?.APP_MODE ?? process.env.APP_MODE,
        AUTH_MODE: bindings?.AUTH_MODE ?? process.env.AUTH_MODE,
        MODEL_MODE: bindings?.MODEL_MODE ?? process.env.MODEL_MODE,
        APP_ORIGIN: bindings?.APP_ORIGIN ?? process.env.APP_ORIGIN,
        DATABASE_URL: bindings?.DATABASE_URL ?? process.env.DATABASE_URL,
        MODEL_API_KEY: bindings?.MODEL_API_KEY ?? process.env.MODEL_API_KEY,
        MODEL_PROVIDER: process.env.MODEL_PROVIDER,
        MODEL_ID: process.env.MODEL_ID,
        OIDC_ISSUER: process.env.OIDC_ISSUER,
        OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID,
        OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET,
        OIDC_REDIRECT_URI: process.env.OIDC_REDIRECT_URI,
        OIDC_STATE_SECRET: process.env.OIDC_STATE_SECRET,
        OIDC_ENTITLEMENTS_FILE: process.env.OIDC_ENTITLEMENTS_FILE,
        DEPLOYMENTS_FILE: process.env.DEPLOYMENTS_FILE,
        DEFAULT_DEPLOYMENT_ID: process.env.DEFAULT_DEPLOYMENT_ID,
        AUTHORIZATION_CONFIG_FILE: process.env.AUTHORIZATION_CONFIG_FILE,
      });
      const ctx = await createAppContext(env);
      const api = new Hono();
      mountApiRoutes(api, ctx);
      return { ctx, api };
    })();
  }
  return boot;
}

export function createApp() {
  const app = new Hono<{ Bindings: WorkerBindings }>();

  app.get("/api/health", (c) => {
    const bindings = c.env ?? ({} as WorkerBindings);
    // Merge Worker bindings over process.env so AUTH_MODE=oidc still sees OIDC_* from dotenv.
    const loaded = tryLoadEnv({
      ...process.env,
      APP_MODE: bindings.APP_MODE ?? process.env.APP_MODE ?? "local",
      AUTH_MODE: bindings.AUTH_MODE ?? process.env.AUTH_MODE ?? "local-fixture",
      MODEL_MODE: bindings.MODEL_MODE ?? process.env.MODEL_MODE ?? "scripted",
      DATABASE_URL: bindings.DATABASE_URL ?? process.env.DATABASE_URL,
      MODEL_API_KEY: bindings.MODEL_API_KEY ?? process.env.MODEL_API_KEY,
    });
    if (!loaded.ok) {
      return c.json({ ok: false, error: loaded.error.message }, 500);
    }
    return c.json({
      ok: true,
      service: "telecom-compass",
      appMode: loaded.env.APP_MODE,
      modelMode: loaded.env.MODEL_MODE,
      authMode: loaded.env.AUTH_MODE,
    });
  });

  app.get("/api/proof", async (c) => c.json(await runProofPipeline()));
  app.post("/api/proof/stream", async () => createProofUiStreamResponse());

  app.all("/api/*", async (c) => {
    const path = new URL(c.req.url).pathname;
    if (path === "/api/health" || path === "/api/proof" || path === "/api/proof/stream") {
      return c.notFound();
    }
    try {
      const { api } = await bootApp(c.env);
      return api.fetch(c.req.raw);
    } catch (error) {
      return c.json(
        {
          error: {
            code: "STARTUP_FAILED",
            message: error instanceof Error ? error.message : "Startup failed",
          },
        },
        503,
      );
    }
  });

  return app;
}

/** Test helper: reset singleton between suites. */
export function resetAppBootForTests(): void {
  boot = null;
}
