import "../../guard";
import type { EntityKind, EntityRef } from "../../domain/types";
import { TmfError } from "../errors";
import { asRecord, entityRef, type RelatedPartyLike } from "./types";

export function unwrapCollection(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const record = asRecord(raw);
  if (!record) {
    throw new TmfError("INVALID_UPSTREAM_RESPONSE", "Expected collection response");
  }
  for (const key of ["items", "data", "results"]) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested;
  }
  throw new TmfError("INVALID_UPSTREAM_RESPONSE", "Collection response missing items array");
}

export function parseRelatedPartyId(entry: unknown): string | undefined {
  const record = asRecord(entry) as RelatedPartyLike | null;
  if (!record) return undefined;
  if (typeof record.id === "string" && record.id.length > 0) return record.id;
  const nested = record.partyOrPartyRole;
  if (nested && typeof nested.id === "string" && nested.id.length > 0) return nested.id;
  return undefined;
}

export function parseEntityRefsFromField(
  raw: Record<string, unknown>,
  field: string,
  kind: EntityKind,
  apiId: `TMF${number}`,
  major: string,
): { refs: EntityRef[]; complete: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!(field in raw)) {
    return { refs: [], complete: false, warnings: [`Field ${field} absent`] };
  }
  const value = raw[field];
  if (value == null) {
    return { refs: [], complete: true, warnings };
  }
  const list = Array.isArray(value) ? value : [value];
  const refs: EntityRef[] = [];
  for (const item of list) {
    const record = asRecord(item);
    if (!record) {
      warnings.push(`Skipped non-object ${field} entry`);
      continue;
    }
    const id =
      typeof record.id === "string"
        ? record.id
        : typeof record.entityId === "string"
          ? record.entityId
          : undefined;
    if (!id) {
      warnings.push(`Skipped ${field} entry without id`);
      continue;
    }
    refs.push(entityRef(kind, id, apiId, major));
  }
  return { refs, complete: true, warnings };
}

/** Nested v5-style relatedEntity / relatedParty wrappers. */
export function parseAffectedEntityRefs(
  raw: Record<string, unknown>,
  apiId: `TMF${number}`,
  major: string,
): { refs: EntityRef[]; complete: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!("relatedEntity" in raw)) {
    return { refs: [], complete: false, warnings: ["relatedEntity absent"] };
  }
  const value = raw.relatedEntity;
  if (value == null) return { refs: [], complete: true, warnings };
  const list = Array.isArray(value) ? value : [value];
  const refs: EntityRef[] = [];
  for (const item of list) {
    const record = asRecord(item);
    if (!record) continue;
    const nested = asRecord(record.entity) ?? record;
    const id = typeof nested.id === "string" ? nested.id : undefined;
    if (!id) {
      warnings.push("Skipped relatedEntity without id");
      continue;
    }
    const referred =
      (typeof nested["@referredType"] === "string" && nested["@referredType"]) ||
      (typeof nested["@type"] === "string" && nested["@type"]) ||
      (typeof record.role === "string" && record.role) ||
      "service";
    const kind = mapReferredType(referred);
    refs.push(entityRef(kind, id, apiIdForKind(kind, apiId), major));
  }
  return { refs, complete: true, warnings };
}

function mapReferredType(value: string): EntityKind {
  const normalized = value.toLowerCase();
  if (normalized.includes("product")) return "product";
  if (normalized.includes("resource")) return "resource";
  if (normalized.includes("customer")) return "customer";
  if (normalized.includes("ticket")) return "troubleTicket";
  if (normalized.includes("order")) return "serviceOrder";
  return "service";
}

function apiIdForKind(kind: EntityKind, fallback: `TMF${number}`): `TMF${number}` {
  switch (kind) {
    case "customer":
      return "TMF629";
    case "product":
      return "TMF637";
    case "service":
      return "TMF638";
    case "resource":
      return "TMF639";
    case "troubleTicket":
      return "TMF621";
    case "serviceOrder":
      return "TMF641";
    default:
      return fallback;
  }
}
