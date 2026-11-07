import "../../guard";
import type { Product } from "../../domain/types";
import { TmfError } from "../errors";
import { parseEntityRefsFromField, unwrapCollection } from "./common";
import {
  asRecord,
  entityRef,
  readString,
  requireId,
  stateValue,
  type NormalizeContext,
  type VersionAdapter,
} from "./types";

function normalizeProduct(raw: unknown, ctx: NormalizeContext): Product {
  const record = asRecord(raw);
  if (!record) {
    throw new TmfError("INVALID_UPSTREAM_RESPONSE", "Product payload must be an object");
  }
  const id = requireId(record, "product");
  const realizing = parseEntityRefsFromField(
    record,
    "realizingService",
    "service",
    "TMF638",
    ctx.major,
  );
  // Some editions use realizingServices
  const alt =
    realizing.refs.length === 0
      ? parseEntityRefsFromField(record, "realizingServices", "service", "TMF638", ctx.major)
      : realizing;
  return {
    ref: entityRef("product", id, ctx.apiId, ctx.major),
    displayName: readString(record, "name"),
    lifecycleState: stateValue(record.status ?? record.lifecycleStatus),
    realizingServices: alt.refs,
    relationsComplete: alt.complete,
    source: ctx.source,
    warnings: alt.warnings,
  };
}

function normalize(raw: unknown, ctx: NormalizeContext): Product | Product[] {
  if (ctx.responseKind === "productCollection") {
    return unwrapCollection(raw).map((item) => normalizeProduct(item, ctx));
  }
  return normalizeProduct(raw, ctx);
}

export const tmf637V4Adapter: VersionAdapter = {
  id: "tmf637-v4",
  apiId: "TMF637",
  major: "v4",
  normalize,
};

export const tmf637V5Adapter: VersionAdapter = {
  id: "tmf637-v5",
  apiId: "TMF637",
  major: "v5",
  normalize,
};
