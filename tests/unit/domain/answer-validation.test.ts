import { describe, expect, it } from "vitest";
import { answerContentSchema, validateAnswerCitations } from "../../../src/contracts/answer";

describe("answer citation validation", () => {
  it("rejects forged evidence IDs", () => {
    const content = answerContentSchema.parse({
      status: "answered",
      claims: [
        {
          kind: "observation",
          text: "Service is down",
          evidenceIds: ["ev-real", "ev-forged"],
        },
      ],
      cards: [],
      gaps: [],
      suggestedQuestions: [],
    });
    const result = validateAnswerCitations(content, new Set(["ev-real"]));
    expect(result.ok).toBe(false);
  });

  it("allows clarification without evidence", () => {
    const content = answerContentSchema.parse({
      status: "clarification",
      claims: [
        {
          kind: "clarification",
          text: "Which service?",
          evidenceIds: [],
        },
      ],
      cards: [],
      gaps: [],
      suggestedQuestions: [],
    });
    expect(validateAnswerCitations(content, new Set()).ok).toBe(true);
  });
});
