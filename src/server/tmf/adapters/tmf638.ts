import "../../guard";
import type { Service } from "../../domain/types";
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

function normalizeService(raw: unknown, ctx: NormalizeContext): Service {
  const record = asRecord(raw);
  if (!record) {
    throw new TmfError("INVALID_UPSTREAM_RESPONSE", "Service payload must be an object");
  }
  const id = requireId(record, "service");
  const resources = parseEntityRefsFromField(
    record,
    "supportingResource",
    "resource",
    "TMF639",
    ctx.major,
  );
  const resourcesAlt =
    resources.refs.length === 0
      ? parseEntityRefsFromField(record, "supportingResources", "resource", "TMF639", ctx.major)
      : resources;
  const orders = parseEntityRefsFromField(
    record,
    "serviceOrder",
    "serviceOrder",
    "TMF641",
    ctx.major,
  );
  const ordersAlt =
    orders.refs.length === 0
      ? parseEntityRefsFromField(record, "serviceOrders", "serviceOrder", "TMF641", ctx.major)
      : orders;

  const enabledRaw = record.isServiceEnabled ?? record.enabled;
  const enabled = typeof enabledRaw === "boolean" ? enabledRaw : undefined;

  return {
    ref: entityRef("service", id, ctx.apiId, ctx.major),
    displayName: readString(record, "name"),
    lifecycleState: stateValue(record.state ?? record.lifecycleStatus),
    enabled,
    supportingResources: resourcesAlt.refs,
    serviceOrders: ordersAlt.refs,
    relationsComplete: resourcesAlt.complete && ordersAlt.complete,
    source: ctx.source,
    warnings: [...resourcesAlt.warnings, ...ordersAlt.warnings],
  };
}

function normalize(raw: unknown, ctx: NormalizeContext): Service | Service[] {
  if (ctx.responseKind === "serviceCollection") {
    return unwrapCollection(raw).map((item) => normalizeService(item, ctx));
  }
  return normalizeService(raw, ctx);
}

export const tmf638V5Adapter: VersionAdapter = {
  id: "tmf638-v5",
  apiId: "TMF638",
  major: "v5",
  normalize,
};
