import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createServer as createViteServer } from "vite";
import { loadEnv } from "../server/config/env";
import { createApp } from "../worker/app";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

async function main(): Promise<void> {
  const env = loadEnv();
  const app = createApp();
  const production = process.env.NODE_ENV === "production";
  const clientDir = path.join(repoRoot, "dist/client");

  if (production || process.env.COMPASS_SERVE_DIST === "1") {
    if (!existsSync(path.join(clientDir, "index.html"))) {
      throw new Error(
        `Missing ${path.join(clientDir, "index.html")}. Run pnpm build before serving dist.`,
      );
    }
    app.use("/*", serveStatic({ root: "./dist/client" }));
    app.get("*", async (c) => {
      if (c.req.path.startsWith("/api")) return c.notFound();
      const html = await readFile(path.join(clientDir, "index.html"), "utf8");
      return c.html(html);
    });
    serve({ fetch: app.fetch, port: env.PORT }, (info) => {
      console.log(`telecom-compass (Node) listening on http://localhost:${info.port}`);
    });
    return;
  }

  // Dev: Vite SPA middleware + Hono /api (no workerd).
  process.env.COMPASS_VITE_NODE = "1";
  const vite = await createViteServer({
    configFile: path.join(repoRoot, "vite.config.ts"),
    root: repoRoot,
    server: {
      middlewareMode: true,
      hmr: { port: 24679 },
    },
    appType: "custom",
  });

  createServer((req, res) => {
    const url = req.url ?? "/";
    if (url.startsWith("/api")) {
      void handleApi(req, res, app.fetch).catch((error: unknown) => {
        console.error(error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end(error instanceof Error ? error.message : "Server error");
        }
      });
      return;
    }

    vite.middlewares(req, res, (error?: unknown) => {
      void (async () => {
        if (error) {
          vite.ssrFixStacktrace(error as Error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(error instanceof Error ? error.message : String(error));
          }
          return;
        }
        if (res.writableEnded) return;
        try {
          const template = await readFile(path.join(repoRoot, "index.html"), "utf8");
          const html = await vite.transformIndexHtml(url, template);
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(html);
        } catch (renderError) {
          vite.ssrFixStacktrace(renderError as Error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(
              renderError instanceof Error ? renderError.message : String(renderError),
            );
          }
        }
      })();
    });
  }).listen(env.PORT, () => {
    console.log(`telecom-compass (Node + Vite) listening on http://localhost:${env.PORT}`);
  });
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  fetchApp: (request: Request) => Response | Promise<Response>,
): Promise<void> {
  const request = await incomingToRequest(req);
  const response = await fetchApp(request);
  await writeNodeResponse(res, response);
}

async function incomingToRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "127.0.0.1";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  const method = req.method ?? "GET";
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return new Request(url, {
    method,
    headers,
    body: Buffer.concat(chunks),
  });
}

async function writeNodeResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "transfer-encoding") return;
    res.setHeader(key, value);
  });
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body as import("node:stream/web").ReadableStream).pipe(res);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
