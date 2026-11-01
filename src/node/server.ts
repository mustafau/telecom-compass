import { serve } from "@hono/node-server";
import { loadEnv } from "../server/config/env";
import { createApp } from "../worker/app";

const env = loadEnv();
const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`telecom-compass (Node) listening on http://localhost:${info.port}`);
  },
);
