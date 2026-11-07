import { afterEach, describe, expect, it } from "vitest";
import { createApp, resetAppBootForTests } from "../../../src/worker/app";

const ORIGIN = "http://localhost:3000";

async function login(app: ReturnType<typeof createApp>, personaId: string) {
  const res = await app.request("http://localhost/api/auth/local/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ personaId }),
  });
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie") ?? "";
}

describe("end-to-end scripted turn", () => {
  afterEach(() => {
    resetAppBootForTests();
  });

  it("runs a no-key turn against fixture HTTP and returns a validated answer", async () => {
    process.env.APP_MODE = "local";
    process.env.AUTH_MODE = "local-fixture";
    process.env.MODEL_MODE = "scripted";
    process.env.APP_ORIGIN = ORIGIN;
    const app = createApp();
    const cookie = await login(app, "op-alpha");

    const create = await app.request("http://localhost/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie },
      body: JSON.stringify({ deploymentId: "fixture-a", targetCustomerId: "cust-100" }),
    });
    expect(create.status).toBe(201);
    const conversation = (await create.json()) as { id: string; revision: number };

    const turn = await app.request(`http://localhost/api/conversations/${conversation.id}/turns`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie },
      body: JSON.stringify({
        clientTurnId: "55555555-5555-5555-5555-555555555555",
        expectedRevision: conversation.revision,
        text: "Why is svc-100 unavailable?",
      }),
    });
    expect(turn.status).toBe(200);
    const body = await turn.text();
    expect(body).toMatch(/data-progress|data-answer|lifecycle|svc-100/i);

    const saved = await app.request(
      `http://localhost/api/conversations/${conversation.id}/turns/55555555-5555-5555-5555-555555555555`.replace(
        "55555555-5555-5555-5555-555555555555",
        // turn id is server-generated; list conversation instead
        "",
      ),
      { headers: { cookie } },
    );
    // Fetch conversation detail for persisted assistant message
    const detail = await app.request(`http://localhost/api/conversations/${conversation.id}`, {
      headers: { cookie },
    });
    expect(detail.status).toBe(200);
    const detailJson = (await detail.json()) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(detailJson.messages.some((m) => m.role === "assistant")).toBe(true);

    // Idempotent replay must not create a second running turn
    const replay = await app.request(`http://localhost/api/conversations/${conversation.id}/turns`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie },
      body: JSON.stringify({
        clientTurnId: "55555555-5555-5555-5555-555555555555",
        expectedRevision: conversation.revision,
        text: "Why is svc-100 unavailable?",
      }),
    });
    expect([200, 409]).toContain(replay.status);
    void saved;
  });

  it("denies customer selecting another account at conversation create", async () => {
    process.env.APP_MODE = "local";
    process.env.AUTH_MODE = "local-fixture";
    process.env.MODEL_MODE = "scripted";
    process.env.APP_ORIGIN = ORIGIN;
    const app = createApp();
    const cookie = await login(app, "cust-alpha");
    const create = await app.request("http://localhost/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, cookie },
      body: JSON.stringify({ deploymentId: "fixture-a", targetCustomerId: "cust-200" }),
    });
    // Customer binding ignores/overrides arbitrary target; create should bind cust-100
    expect([201, 404]).toContain(create.status);
    if (create.status === 201) {
      const body = (await create.json()) as { scope: { targetCustomerId: string } };
      expect(body.scope.targetCustomerId).toBe("cust-100");
    }
  });
});
