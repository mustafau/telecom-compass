import "../../guard";
import type {
  Customer,
  EntityKind,
  EntityRef,
  Product,
  Resource,
  Service,
  ServiceOrder,
  SourceMeta,
  TroubleTicket,
} from "../../domain/types";

export type NormalizedEntity =
  | Customer
  | Product
  | Service
  | Resource
  | TroubleTicket
  | ServiceOrder;

export type NormalizeContext = {
  source: SourceMeta;
  apiId: `TMF${number}`;
  major: string;
  responseKind: string;
};

export type VersionAdapter = {
  id: string;
  apiId: `TMF${number}`;
  major: "v4" | "v5";
  normalize(raw: unknown, ctx: NormalizeContext): NormalizedEntity | NormalizedEntity[];
};

export type RelatedPartyLike = {
  id?: string;
  href?: string;
  role?: string;
  "@referredType"?: string;
  partyOrPartyRole?: { id?: string; "@type"?: string };
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function requireId(raw: Record<string, unknown>, kind: EntityKind): string {
  const id = raw.id;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`Missing ${kind} id`);
  }
  return id;
}

export function stateValue(raw: unknown): { raw: string; meaning: string | null } | undefined {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  return { raw, meaning: null };
}

export function entityRef(
  kind: EntityKind,
  id: string,
  apiId: `TMF${number}`,
  major: string,
): EntityRef {
  return { kind, id, apiId, major };
}

export function readString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
