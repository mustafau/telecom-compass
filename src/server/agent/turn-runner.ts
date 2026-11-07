import "../guard";
import { randomUUID } from "node:crypto";
import {
  generateText,
  Output,
  stepCountIs,
  type LanguageModel,
} from "ai";
import {
  answerContentSchema,
  answerEnvelopeSchema,
  validateAnswerCitations,
  type AnswerContent,
  type AnswerEnvelope,
} from "../../contracts/answer";
import type { CompassStore } from "../db/types";
import { createEvidenceLedger, type EvidenceLedger } from "../evidence/ledger";
import { createRunBudget, type ExecutionContext } from "../domain/execution";
import type { DomainServices } from "../domain/services/catalog";
import type { Principal } from "../auth/types";
import type { CheckedProfile } from "../tmf/profile/revision";
import { createDomainTools } from "../tools/domain-tools";
import { safeLog } from "../telemetry/safe-log";

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
  modelMode: "scripted" | "provider";
  /** Required when modelMode=provider. */
  model?: LanguageModel;
  maxDiscoverySteps?: number;
  finalAnswerMaxTokens?: number;
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
 * Turn loop: scripted (deterministic, no key) or provider (AI SDK discovery +
 * structured synthesis). Both paths use real domain tools and evidence validation.
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

  if (deps.modelMode === "provider") {
    return runProviderTurn(deps, input, ctx, ledger, progress);
  }
  return runScriptedTurn(deps, input, ctx, ledger, progress, budget);
}

async function runProviderTurn(
  deps: TurnRunnerDeps,
  input: RunTurnInput,
  ctx: ExecutionContext,
  ledger: EvidenceLedger,
  progress: (stage: string, label: string) => void,
): Promise<AnswerEnvelope> {
  if (!deps.model) {
    throw Object.assign(new Error("Provider model missing"), { code: "MISCONFIGURED" });
  }
  const model = deps.model;
  const tools = createDomainTools({
    services: deps.services,
    profile: deps.profile,
    ctx,
    ledger,
  });
  const maxSteps = deps.maxDiscoverySteps ?? 6;

  progress("discover", "Gathering authorized evidence");
  const system = [
    "You are Telecom Compass, an operator assistant over TM Forum read APIs.",
    "Use only the provided tools. Do not invent resource ids, restoration times, or relationships.",
    "Do not claim facts without tool evidence. If tools are unavailable or return gaps, say so.",
    `Deployment: ${deps.profile.id}. Audience: ${input.principal.audience}.`,
    input.targetCustomerId
      ? `Target customer id (server-bound): ${input.targetCustomerId}.`
      : "No target customer is bound; ask for clarification if customer-scoped data is required.",
    "Prefer diagnoseService for outage/why questions; getServiceDetails for simple status.",
  ].join("\n");

  try {
    await generateText({
      model,
      tools,
      stopWhen: stepCountIs(maxSteps),
      system,
      prompt: input.text,
      abortSignal: ctx.signal,
    });
  } catch (error) {
    safeLog("warn", "turn.provider.discovery_failed", {
      code: error instanceof Error ? error.name : "ERROR",
    });
    // Fall through to synthesis with whatever evidence was recorded.
  }

  const latest = await deps.store.getTurn(input.principal.tenantId, input.turnId);
  if (latest?.cancelRequested || ctx.signal.aborted) {
    throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
  }

  progress("synthesize", "Preparing structured answer");
  const frozen = ledger.freeze();
  const evidenceIds = new Set(frozen.map((e) => e.id));
  const evidenceBundle = frozen.map((e) => ({
    id: e.id,
    kind: e.kind,
    entityType: e.entityType,
    entityId: e.entityId,
    fields: e.sanitizedFields,
  }));

  let content: AnswerContent;
  try {
    const synthesis = await generateText({
      model,
      output: Output.object({ schema: answerContentSchema }),
      maxOutputTokens: deps.finalAnswerMaxTokens ?? 2_000,
      abortSignal: ctx.signal,
      system: [
        "Synthesize a structured Compass answer from the evidence bundle only.",
        "Every factual claim and card field must cite evidenceIds from the bundle.",
        "Do not invent ids, estimates, or statuses. Prefer status partial/insufficient_evidence when thin.",
        "Cards must use only values present in cited evidence fields.",
      ].join("\n"),
      prompt: [
        `User question: ${input.text}`,
        `Evidence bundle JSON: ${JSON.stringify(evidenceBundle)}`,
      ].join("\n"),
    });
    const output = synthesis.output;
    if (!output) {
      throw new Error("empty synthesis");
    }
    content = answerContentSchema.parse(output);
  } catch (error) {
    safeLog("warn", "turn.provider.synthesis_failed", {
      code: error instanceof Error ? error.name : "ERROR",
    });
    content = answerContentSchema.parse({
      status: evidenceIds.size ? "partial" : "insufficient_evidence",
      claims: [
        {
          kind: evidenceIds.size ? "guidance" : "clarification",
          text: evidenceIds.size
            ? "Evidence was gathered but structured synthesis failed; inspect evidence ids in the drawer."
            : "I could not gather enough authorized evidence for that question.",
          evidenceIds: evidenceIds.size ? [...evidenceIds].slice(0, 4) : [],
        },
      ],
      cards: [],
      gaps: ["provider synthesis unavailable"],
      suggestedQuestions: [],
    });
  }

  const citation = validateAnswerCitations(content, evidenceIds);
  if (!citation.ok) {
    content.claims = content.claims.filter((c) =>
      c.evidenceIds.every((id) => evidenceIds.has(id)),
    );
    content.cards = [];
    content.status = content.claims.length ? "partial" : "insufficient_evidence";
    content.gaps.push("Removed claims with invalid citations");
  }

  return buildEnvelope(deps, input, content);
}

async function runScriptedTurn(
  deps: TurnRunnerDeps,
  input: RunTurnInput,
  ctx: ExecutionContext,
  ledger: EvidenceLedger,
  progress: (stage: string, label: string) => void,
  budget: ReturnType<typeof createRunBudget>,
): Promise<AnswerEnvelope> {
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
    return buildEnvelope(deps, input, {
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
      return buildEnvelope(deps, input, {
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
    if (
      code === "NOT_FOUND_OR_NOT_AUTHORIZED" ||
      (error instanceof Error && error.name === "NOT_FOUND_OR_NOT_AUTHORIZED")
    ) {
      return buildEnvelope(deps, input, {
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
    content.claims = content.claims.filter((c) =>
      c.evidenceIds.every((id) => evidenceIds.has(id)),
    );
    content.cards = [];
    content.status = content.claims.length ? "partial" : "insufficient_evidence";
    content.gaps.push("Removed claims with invalid citations");
  }

  return buildEnvelope(deps, input, content);
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
  content: AnswerContent,
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
