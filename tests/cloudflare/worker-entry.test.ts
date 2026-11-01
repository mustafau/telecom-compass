import { describe, expect, it } from "vitest";
import app from "../../src/worker/index";

describe("Cloudflare Worker entry", () => {
  it("exports a fetch-compatible Hono app", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    const json = (await response.json()) as { ok: boolean; service: string };
    expect(json.ok).toBe(true);
    expect(json.service).toBe("telecom-compass");
  });
});
