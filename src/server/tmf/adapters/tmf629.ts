import "../../guard";
import type { Customer } from "../../domain/types";
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

function normalizeCustomer(raw: unknown, ctx: NormalizeContext): Customer {
  const record = asRecord(raw);
  if (!record) {
    throw new TmfError("INVALID_UPSTREAM_RESPONSE", "Customer payload must be an object");
  }
  const id = requireId(record, "customer");
  return {
    ref: entityRef("customer", id, ctx.apiId, ctx.major),
    displayName: readString(record, "name") ?? readString(record, "tradingName"),
    status: stateValue(record.status),
    source: ctx.source,
    warnings: [],
  };
}

function normalize(raw: unknown, ctx: NormalizeContext): Customer | Customer[] {
  if (ctx.responseKind === "customerCollection") {
    return unwrapCollection(raw).map((item) => normalizeCustomer(item, ctx));
  }
  return normalizeCustomer(raw, ctx);
}

export const tmf629V4Adapter: VersionAdapter = {
  id: "tmf629-v4",
  apiId: "TMF629",
  major: "v4",
  normalize,
};

export const tmf629V5Adapter: VersionAdapter = {
  id: "tmf629-v5",
  apiId: "TMF629",
  major: "v5",
  normalize,
};
