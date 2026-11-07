import "../../guard";
import type { TroubleTicket } from "../../domain/types";
import { TmfError } from "../errors";
import { parseAffectedEntityRefs, unwrapCollection } from "./common";
import {
  asRecord,
  entityRef,
  readString,
  requireId,
  stateValue,
  type NormalizeContext,
  type VersionAdapter,
} from "./types";

function normalizeTicket(raw: unknown, ctx: NormalizeContext): TroubleTicket {
  const record = asRecord(raw);
  if (!record) {
    throw new TmfError("INVALID_UPSTREAM_RESPONSE", "Trouble ticket payload must be an object");
  }
  const id = requireId(record, "troubleTicket");
  const affected = parseAffectedEntityRefs(record, ctx.apiId, ctx.major);
  const description =
    readString(record, "description") ?? readString(record, "ticketType") ?? undefined;

  let expectedResolution: TroubleTicket["expectedResolution"];
  const eta = readString(record, "expectedResolutionDate");
  if (eta) {
    expectedResolution = { at: eta, type: "estimate" };
  }

  return {
    ref: entityRef("troubleTicket", id, ctx.apiId, ctx.major),
    displayName: readString(record, "name") ?? description,
    status: stateValue(record.status),
    severity: readString(record, "severity") ?? readString(record, "priority"),
    customerVisibleDescription: description,
    affectedEntities: affected.refs,
    expectedResolution,
    relationsComplete: affected.complete,
    source: ctx.source,
    warnings: affected.warnings,
  };
}

function normalize(raw: unknown, ctx: NormalizeContext): TroubleTicket | TroubleTicket[] {
  if (ctx.responseKind === "troubleTicketCollection") {
    return unwrapCollection(raw).map((item) => normalizeTicket(item, ctx));
  }
  return normalizeTicket(raw, ctx);
}

export const tmf621V4Adapter: VersionAdapter = {
  id: "tmf621-v4",
  apiId: "TMF621",
  major: "v4",
  normalize,
};

export const tmf621V5Adapter: VersionAdapter = {
  id: "tmf621-v5",
  apiId: "TMF621",
  major: "v5",
  normalize,
};
