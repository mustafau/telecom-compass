import { describe, expect, it } from "vitest";
import { TmfError } from "../../../src/server/tmf/errors";
import { createFixtureServer } from "../../../src/server/tmf/fixtures/server";
import { boundedGet } from "../../../src/server/tmf/transport/http";
import { assertSafeBaseUrl, buildOperationUrl, fillPathTemplate } from "../../../src/server/tmf/transport/url";

describe("TMF transport", () => {
  it("builds URLs only from base + fixed templates + validated args", () => {
    const url = buildOperationUrl(
      "http://127.0.0.1:8789/a/customer/v4",
      {
        method: "GET",
        path: "/customer/{id}",
        responseKind: "customer",
        query: [],
      },
      { id: "cust-100" },
      {},
    );
    expect(url.href).toBe("http://127.0.0.1:8789/a/customer/v4/customer/cust-100");
  });

  it("rejects credentials in base URLs and path injection", () => {
    expect(() => assertSafeBaseUrl("http://user:pass@127.0.0.1:8789/a")).toThrow(TmfError);
    expect(() => fillPathTemplate("/customer/{id}", { id: "../admin" })).toThrow(TmfError);
    expect(() => fillPathTemplate("/customer/{id}", { id: "a?x=1" })).toThrow(TmfError);
  });

  it("denies cross-origin redirects", async () => {
    const server = createFixtureServer("a");
    await expect(
      boundedGet({
        url: new URL("http://127.0.0.1:8789/a/redirect"),
        fetchImpl: server.fetch,
        allowedOrigin: new URL("http://127.0.0.1:8789/a/customer/v4"),
      }),
    ).rejects.toMatchObject({ code: "REDIRECT_DENIED" });
  });

  it("enforces response size limit while reading", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("x".repeat(100), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    await expect(
      boundedGet({
        url: new URL("http://127.0.0.1:8789/x"),
        fetchImpl,
        maxBytes: 10,
      }),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });
});
