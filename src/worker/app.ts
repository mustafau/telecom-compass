import { Hono } from "hono";
import { createProofUiStreamResponse, runProofPipeline } from "../server/agent/proof-pipeline";
import { tryLoadEnv } from "../server/config/env";
import type { WorkerBindings } from "./bindings";

export type { WorkerBindings };

export function createApp() {
  const app = new Hono<{ Bindings: WorkerBindings }>();

  app.get("/api/health", (c) => {
    const bindings = c.env ?? ({} as WorkerBindings);
    const loaded = tryLoadEnv({
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
    });
  });

  app.get("/api/proof", async (c) => {
    const result = await runProofPipeline();
    return c.json(result);
  });

  app.post("/api/proof/stream", async () => createProofUiStreamResponse());

  return app;
}
