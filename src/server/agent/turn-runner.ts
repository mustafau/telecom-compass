import "../guard";
import { randomUUID } from "node:crypto";
import {
  answerContentSchema,
  answerEnvelopeSchema,
  validateAnswerCitations,
  type AnswerEnvelope,
} from "../../contracts/answer";
import type { CompassStore } from "../db/types";
import { createEvidenceLedger } from "../evidence/ledger";
import { createRunBudget, type ExecutionContext } from "../domain/execution";
import type { DomainServices } from "../domain/services/catalog";
import type { Principal } from "../auth/types";
import type { CheckedProfile } from "../tmf/profile/revision";

export type TurnProgressEvent = {
  sequence: number;
  stage: string;
  label: string;
};

export type TurnRunnerDeps = {
  store: CompassStore;
  services: DomainServices;
  profile: CheckedProfile;
  environment: "fixture" | "live";
};

export type RunTurnInput = {
  principal: Principal;
  conversationId: string;
  turnId: string;
  leaseToken: string;
  text: string;
  targetCustomerId?: string | null;
  signal?: AbortSignal;
  deadlineMs?: number;
  onProgress?: (event: TurnProgressEvent) => void;
};

/**
 * Scripted discovery + synthesis loop that exercises real domain tools and
 * evidence validation without requiring a provider key.
 */
export async function runTurn(
  deps: TurnRunnerDeps,
  input: RunTurnInput,
): Promise<AnswerEnvelope> {
  const budget = createRunBudget({
    deadlineMs: input.deadlineMs ?? 45_000,
    signal: input.signal,
  });
  const ctx: ExecutionContext = {
    principal: input.principal,
    deploymentId: deps.profile.id,
    profileRevision: deps.profile.revision,
    conversationId: input.conversationId,
    turnId: input.turnId,
    targetCustomerId: input.targetCustomerId ?? undefined,
    signal: budget.signal,
    deadline: Date.now() + (input.deadlineMs ?? 45_000),
    budget,
    leaseToken: input.leaseToken,
  };
  const ledger = createEvidenceLedger(deps.store, ctx);
  let seq = 0;
  const progress = (stage: string, label: string) => {
    seq += 1;
    input.onProgress?.({ sequence: seq, stage, label });
  };

  const turn = await deps.store.getTurn(input.principal.tenantId, input.turnId);
  if (!turn || turn.leaseToken !== input.leaseToken) {
    throw Object.assign(new Error("Lease mismatch"), { code: "LEASE_MISMATCH" });
  }
  if (turn.cancelRequested) {
    throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
  }

  progress("discover", "Checking service details");
  const lower = input.text.toLowerCase();
  let diagnosis:
    | Awaited<ReturnType<DomainServices["diagnoseService"]>>
    | undefined;
  let serviceDetails:
    | Awaited<ReturnType<DomainServices["getServiceDetails"]>>
    | undefined;

  const serviceIdMatch = input.text.match(/\b((?:svc|service)-[a-z0-9-]+)\b/i);
  const serviceId = serviceIdMatch?.[1] ?? "svc-100";

  if (lower.includes("ticket") && !deps.profile.capabilities.ticketRead) {
    progress("synthesize", "Preparing answer");
    return buildEnvelope(deps, input, ledger, {
      status: "partial",
      claims: [
        {
          kind: "guidance",
          text: "Ticket lookup is not available for this deployment.",
          evidenceIds: [],
        },
      ],
      cards: [],
      gaps: ["ticketRead capability disabled"],
      suggestedQuestions: ["What is the service lifecycle state?"],
    });
  }

  if (lower.includes("which services") || lower.includes("belong to this customer")) {
    if (!deps.profile.capabilities.customerToServices) {
      progress("synthesize", "Preparing answer");
      return buildEnvelope(deps, input, ledger, {
        status: "partial",
        claims: [
          {
            kind: "guidance",
            text: "Customer-to-service relationship resolution is not configured for this deployment.",
            evidenceIds: [],
          },
        ],
        cards: [],
        gaps: ["customerToServices unavailable"],
        suggestedQuestions: [],
      });
    }
  }

  try {
    if (lower.includes("diagnos") || lower.includes("unavailable") || lower.includes("why")) {
      diagnosis = await deps.services.diagnoseService(ctx, ledger, serviceId);
    } else {
      serviceDetails = await deps.services.getServiceDetails(ctx, ledger, serviceId);
    }
  } catch (error) {
    const code = error instanceof Error && "name" in error ? String(error.name) : "ERROR";
    if (code === "NOT_FOUND_OR_NOT_AUTHORIZED" || (error instanceof Error && error.name === "NOT_FOUND_OR_NOT_AUTHORIZED")) {
      return buildEnvelope(deps, input, ledger, {
        status: "insufficient_evidence",
        claims: [
          {
            kind: "guidance",
            text: "That resource is not available in your authorized scope.",
            evidenceIds: [],
          },
        ],
        cards: [],
        gaps: ["not authorized or not found"],
        suggestedQuestions: [],
      });
    }
    throw error;
  }

  const latest = await deps.store.getTurn(input.principal.tenantId, input.turnId);
  if (latest?.cancelRequested || budget.signal.aborted) {
    throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
  }

  progress("synthesize", "Validating answer");
  const evidenceIds = new Set(ledger.freeze().map((e) => e.id));
  const content = synthesize(diagnosis, serviceDetails, evidenceIds, lower);

  const citation = validateAnswerCitations(content, evidenceIds);
  if (!citation.ok) {
    // One deterministic repair: drop forged citations.
    content.claims = content.claims.filter((c) =>
      c.evidenceIds.every((id) => evidenceIds.has(id)),
    );
    content.cards = [];
    content.status = content.claims.length ? "partial" : "insufficient_evidence";
    content.gaps.push("Removed claims with invalid citations");
  }

  return buildEnvelope(deps, input, ledger, content);
}

function synthesize(
  diagnosis: Awaited<ReturnType<DomainServices["diagnoseService"]>> | undefined,
  serviceDetails: Awaited<ReturnType<DomainServices["getServiceDetails"]>> | undefined,
  evidenceIds: Set<string>,
  lower: string,
) {
  if (diagnosis && diagnosis.status !== "unavailable") {
    const service = diagnosis.data.service;
    const ev0 = diagnosis.evidenceIds[0]!;
    const claims: Array<{
      kind: "observation" | "inference" | "guidance" | "clarification";
      text: string;
      evidenceIds: string[];
    }> = [
      {
        kind: "observation",
        text: `Service ${service.ref.id} lifecycle is ${service.lifecycleState?.raw ?? "unknown"}; enabled=${String(service.enabled)}.`,
        evidenceIds: [ev0],
      },
    ];
    if (service.enabled === false && service.lifecycleState?.raw === "active") {
      claims.push({
        kind: "inference",
        text: "Lifecycle active does not mean the service is currently enabled for traffic.",
        evidenceIds: [ev0],
      });
    }
    for (const ticket of diagnosis.data.tickets) {
      const ev = diagnosis.evidenceIds.find((id) => evidenceIds.has(id)) ?? ev0;
      claims.push({
        kind: "observation",
        text: `Related ticket ${ticket.ref.id} status ${ticket.status?.raw ?? "unknown"}.`,
        evidenceIds: [ev],
      });
      if (lower.includes("restor") && ticket.expectedResolution) {
        claims.push({
          kind: "observation",
          text: `Ticket estimate ${ticket.expectedResolution.at} is source-dated; restoration is unconfirmed without current evidence.`,
          evidenceIds: [ev],
        });
      }
    }
    const cards = [
      {
        kind: "service" as const,
        entityId: service.ref.id,
        title: service.displayName ?? service.ref.id,
        fields: [
          {
            key: "lifecycleState",
            label: "Lifecycle",
            value: service.lifecycleState?.raw ?? null,
            evidenceId: ev0,
            sourcePointer: "/lifecycleState/raw",
          },
          {
            key: "enabled",
            label: "Enabled",
            value: service.enabled ?? null,
            evidenceId: ev0,
            sourcePointer: "/enabled",
          },
        ],
        evidenceIds: [ev0],
      },
    ];
    return answerContentSchema.parse({
      status: diagnosis.data.gaps.length ? "partial" : "answered",
      claims,
      cards,
      gaps: diagnosis.data.gaps.map((g) => `${g.capability}: ${g.reason}`),
      suggestedQuestions: ["Is there an open trouble ticket?"],
    });
  }

  if (serviceDetails && serviceDetails.status !== "unavailable") {
    const service = serviceDetails.data;
    const ev0 = serviceDetails.evidenceIds[0]!;
    return answerContentSchema.parse({
      status: "answered",
      claims: [
        {
          kind: "observation",
          text: `Service ${service.ref.id} lifecycle ${service.lifecycleState?.raw ?? "unknown"}, enabled=${String(service.enabled)}.`,
          evidenceIds: [ev0],
        },
      ],
      cards: [
        {
          kind: "service",
          entityId: service.ref.id,
          title: service.displayName ?? service.ref.id,
          fields: [
            {
              key: "lifecycleState",
              label: "Lifecycle",
              value: service.lifecycleState?.raw ?? null,
              evidenceId: ev0,
              sourcePointer: "/lifecycleState/raw",
            },
          ],
          evidenceIds: [ev0],
        },
      ],
      gaps: [],
      suggestedQuestions: [],
    });
  }

  return answerContentSchema.parse({
    status: "insufficient_evidence",
    claims: [
      {
        kind: "clarification",
        text: "I could not gather enough authorized evidence for that question.",
        evidenceIds: [],
      },
    ],
    cards: [],
    gaps: ["no usable evidence"],
    suggestedQuestions: [],
  });
}

function buildEnvelope(
  deps: TurnRunnerDeps,
  input: RunTurnInput,
  _ledger: ReturnType<typeof createEvidenceLedger>,
  content: ReturnType<typeof answerContentSchema.parse>,
): AnswerEnvelope {
  return answerEnvelopeSchema.parse({
    schemaVersion: "1",
    answerId: randomUUID(),
    turnId: input.turnId,
    environment: deps.environment,
    createdAt: new Date().toISOString(),
    content,
  });
}
