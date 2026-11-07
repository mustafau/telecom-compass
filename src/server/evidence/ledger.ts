import "../guard";
import type { EntityRef } from "../domain/types";
import type { ExecutionContext } from "../domain/execution";
import type { EvidenceRow, MemoryStore } from "../db/memory-store";

export type EvidenceLedger = {
  record(input: {
    kind: "tmf-record" | "document";
    entity?: EntityRef;
    fields: Record<string, unknown>;
    visibility: "customer" | "operator";
    sourceLocator: string;
    provenance?: Record<string, unknown>;
  }): EvidenceRow;
  freeze(): EvidenceRow[];
  has(id: string): boolean;
  get(id: string): EvidenceRow | undefined;
};

export function createEvidenceLedger(
  store: MemoryStore,
  ctx: ExecutionContext,
): EvidenceLedger {
  const ids = new Set<string>();
  const byId = new Map<string, EvidenceRow>();

  return {
    record(input) {
      const row = store.addEvidence({
        tenantId: ctx.principal.tenantId,
        conversationId: ctx.conversationId,
        turnId: ctx.turnId,
        deploymentId: ctx.deploymentId,
        profileRevision: ctx.profileRevision,
        kind: input.kind,
        entityType: input.entity?.kind ?? null,
        entityId: input.entity?.id ?? null,
        sanitizedFields: input.fields,
        provenance: input.provenance ?? {},
        visibility: input.visibility,
        retrievedAt: new Date(),
        sourceUpdatedAt: null,
        expiresAt: null,
        sourceLocator: input.sourceLocator,
      });
      ids.add(row.id);
      byId.set(row.id, row);
      return row;
    },
    freeze() {
      return [...byId.values()];
    },
    has(id) {
      return ids.has(id);
    },
    get(id) {
      return byId.get(id);
    },
  };
}

export function projectForAudience(
  fields: Record<string, unknown>,
  audience: "operator" | "customer",
): Record<string, unknown> {
  const forbidden = new Set([
    "href",
    "internalNote",
    "troubleshootingNotes",
    "equipmentAddress",
    "credential",
    "password",
    "secret",
    "raw",
    "upstreamUrl",
  ]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (forbidden.has(key)) continue;
    if (audience === "customer" && (key === "supportingResources" || key === "topology")) {
      continue;
    }
    out[key] = value;
  }
  return out;
}
