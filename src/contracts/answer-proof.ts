import { z } from "zod";

/** Minimal structured-output schema for the M0 SDK proof (not the product answer schema). */
export const proofAnswerSchema = z.object({
  status: z.enum(["answered", "partial", "insufficient_evidence"]),
  summary: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1),
});

export type ProofAnswer = z.infer<typeof proofAnswerSchema>;
