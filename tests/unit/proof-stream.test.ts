import { describe, expect, it } from "vitest";
import { createProofUiStreamResponse } from "../../src/server/agent/proof-pipeline";

describe("createProofUiStreamResponse", () => {
  it("emits UI message stream data parts", async () => {
    const response = createProofUiStreamResponse();
    expect(response.headers.get("content-type") ?? "").toMatch(/text\/event-stream|ui-message/);

    const body = await response.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body).toMatch(/data-progress|proof-answer|started|complete/);
  });
});
