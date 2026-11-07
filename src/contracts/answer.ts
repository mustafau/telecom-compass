import { z } from "zod";

export const answerContentSchema = z.object({
  status: z.enum(["answered", "partial", "insufficient_evidence", "clarification"]),
  claims: z
    .array(
      z.object({
        kind: z.enum(["observation", "inference", "guidance", "clarification"]),
        text: z.string().min(1).max(800),
        evidenceIds: z.array(z.string().min(1).max(128)).max(16),
      }),
    )
    .max(12),
  cards: z
    .array(
      z.object({
        kind: z.enum(["service", "troubleTicket", "serviceOrder", "estimate"]),
        entityId: z.string().min(1).max(128),
        title: z.string().max(160),
        fields: z
          .array(
            z.object({
              key: z.string().max(80),
              label: z.string().max(100),
              value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
              evidenceId: z.string().min(1).max(128),
              sourcePointer: z.string().max(300),
            }),
          )
          .max(10),
        evidenceIds: z.array(z.string().min(1).max(128)).max(16),
      }),
    )
    .max(8),
  gaps: z.array(z.string().max(400)).max(8),
  suggestedQuestions: z.array(z.string().max(200)).max(3),
});

export const answerEnvelopeSchema = z.object({
  schemaVersion: z.literal("1"),
  answerId: z.string().uuid(),
  turnId: z.string().uuid(),
  environment: z.enum(["fixture", "live"]),
  createdAt: z.string().datetime(),
  content: answerContentSchema,
});

export type AnswerContent = z.infer<typeof answerContentSchema>;
export type AnswerEnvelope = z.infer<typeof answerEnvelopeSchema>;

export function validateAnswerCitations(
  content: AnswerContent,
  allowedEvidenceIds: Set<string>,
): { ok: true } | { ok: false; reason: string } {
  for (const claim of content.claims) {
    if (claim.kind === "clarification" && claim.evidenceIds.length === 0) continue;
    if (claim.evidenceIds.length === 0 && claim.kind !== "clarification") {
      return { ok: false, reason: "Factual claim missing evidenceIds" };
    }
    for (const id of claim.evidenceIds) {
      if (!allowedEvidenceIds.has(id)) {
        return { ok: false, reason: `Unknown evidence id ${id}` };
      }
    }
  }
  for (const card of content.cards) {
    for (const id of card.evidenceIds) {
      if (!allowedEvidenceIds.has(id)) {
        return { ok: false, reason: `Unknown card evidence id ${id}` };
      }
    }
    for (const field of card.fields) {
      if (!allowedEvidenceIds.has(field.evidenceId)) {
        return { ok: false, reason: `Unknown field evidence id ${field.evidenceId}` };
      }
    }
  }
  return { ok: true };
}
