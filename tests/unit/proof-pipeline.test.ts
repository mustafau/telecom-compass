import { describe, expect, it } from "vitest";
import { runProofPipeline } from "../../src/server/agent/proof-pipeline";
import { proofAnswerSchema } from "../../src/contracts/answer-proof";

describe("runProofPipeline", () => {
  it("runs a native tool then structured synthesis without provider keys", async () => {
    const result = await runProofPipeline();
    expect(result.toolEvidenceIds.length).toBeGreaterThan(0);
    expect(proofAnswerSchema.parse(result.answer).status).toBe("answered");
    expect(result.answer.evidenceIds[0]).toMatch(/^ev-proof-/);
  });
});
