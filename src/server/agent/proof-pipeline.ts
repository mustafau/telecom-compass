import "../guard";
import {
  generateText,
  Output,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
} from "ai";
import { proofAnswerSchema, type ProofAnswer } from "../../contracts/answer-proof";
import { createProofTools } from "../tools/proof-tools";
import { createScriptedLanguageModel } from "./scripted-model";

export type ProofPipelineResult = {
  answer: ProofAnswer;
  toolEvidenceIds: string[];
};

/** End-to-end no-key proof: native tool call then structured synthesis. */
export async function runProofPipeline(): Promise<ProofPipelineResult> {
  const model = createScriptedLanguageModel();
  const tools = createProofTools();

  const discovery = await generateText({
    model,
    tools,
    stopWhen: stepCountIs(2),
    prompt: "What is the status of the proof service?",
  });

  const toolEvidenceIds = discovery.toolResults
    .map((result) => {
      const output = result.output as { evidenceId?: string } | undefined;
      return output?.evidenceId;
    })
    .filter((id): id is string => typeof id === "string");

  const synthesis = await generateText({
    model,
    output: Output.object({ schema: proofAnswerSchema }),
    prompt: [
      "Synthesize a structured proof answer.",
      `Tool evidence IDs: ${toolEvidenceIds.join(", ") || "none"}`,
    ].join("\n"),
  });

  const answer = synthesis.output;
  if (!answer) {
    throw new Error("Structured proof synthesis produced no object output");
  }

  return { answer, toolEvidenceIds };
}

/** Streams progress data parts then a final structured proof payload for UI consumption. */
export function createProofUiStreamResponse(): Response {
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      writer.write({
        type: "data-progress",
        id: "progress-1",
        data: { stage: "started", message: "Starting proof turn" },
      });

      const result = await runProofPipeline();

      writer.write({
        type: "data-progress",
        id: "progress-2",
        data: { stage: "complete", message: "Proof synthesis complete" },
      });

      writer.write({
        type: "data-proof-answer",
        id: "answer-1",
        data: result.answer,
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
