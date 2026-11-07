import "../../guard";
import type { Resource } from "../../domain/types";
import { TmfError } from "../errors";
import { unwrapCollection } from "./common";
import {
  asRecord,
  entityRef,
  readString,
  requireId,
  stateValue,
  type NormalizeContext,
  type VersionAdapter,
} from "./types";

function normalizeResource(raw: unknown, ctx: NormalizeContext): Resource {
  const record = asRecord(raw);
  if (!record) {
    throw new TmfError("INVALID_UPSTREAM_RESPONSE", "Resource payload must be an object");
  }
  const id = requireId(record, "resource");
  return {
    ref: entityRef("resource", id, ctx.apiId, ctx.major),
    displayName: readString(record, "name"),
    operationalState: stateValue(record.resourceStatus ?? record.operationalState),
    source: ctx.source,
    warnings: [],
  };
}

function normalize(raw: unknown, ctx: NormalizeContext): Resource | Resource[] {
  if (ctx.responseKind === "resourceCollection") {
    return unwrapCollection(raw).map((item) => normalizeResource(item, ctx));
  }
  return normalizeResource(raw, ctx);
}

export const tmf639V4Adapter: VersionAdapter = {
  id: "tmf639-v4",
  apiId: "TMF639",
  major: "v4",
  normalize,
};

export const tmf639V5Adapter: VersionAdapter = {
  id: "tmf639-v5",
  apiId: "TMF639",
  major: "v5",
  normalize,
};
