import "../../guard";
import type { ServiceOrder } from "../../domain/types";
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

function normalizeOrder(raw: unknown, ctx: NormalizeContext): ServiceOrder {
  const record = asRecord(raw);
  if (!record) {
    throw new TmfError("INVALID_UPSTREAM_RESPONSE", "Service order payload must be an object");
  }
  const id = requireId(record, "serviceOrder");
  const itemsRaw = record.serviceOrderItem;
  const warnings: string[] = [];
  let itemsComplete = true;
  const items: ServiceOrder["items"] = [];

  if (!("serviceOrderItem" in record)) {
    itemsComplete = false;
    warnings.push("serviceOrderItem absent");
  } else if (itemsRaw == null) {
    itemsComplete = true;
  } else {
    const list = Array.isArray(itemsRaw) ? itemsRaw : [itemsRaw];
    for (const entry of list) {
      const item = asRecord(entry);
      if (!item) {
        warnings.push("Skipped non-object serviceOrderItem");
        continue;
      }
      const itemId = typeof item.id === "string" ? item.id : undefined;
      if (!itemId) {
        warnings.push("Skipped serviceOrderItem without id");
        continue;
      }
      const serviceRec = asRecord(item.service);
      const serviceId = serviceRec && typeof serviceRec.id === "string" ? serviceRec.id : undefined;
      items.push({
        id: itemId,
        state: stateValue(item.state),
        action: readString(item, "action"),
        service: serviceId
          ? entityRef("service", serviceId, "TMF638", ctx.major)
          : undefined,
        statedBlocker: readString(item, "statedBlocker"),
      });
    }
  }

  let expectedCompletion: ServiceOrder["expectedCompletion"];
  const eta = readString(record, "expectedCompletionDate");
  if (eta) {
    expectedCompletion = { at: eta, type: "estimate" };
  }

  return {
    ref: entityRef("serviceOrder", id, ctx.apiId, ctx.major),
    displayName: readString(record, "description") ?? readString(record, "category"),
    state: stateValue(record.state),
    items,
    itemsComplete,
    expectedCompletion,
    source: ctx.source,
    warnings,
  };
}

function normalize(raw: unknown, ctx: NormalizeContext): ServiceOrder | ServiceOrder[] {
  if (ctx.responseKind === "serviceOrderCollection") {
    return unwrapCollection(raw).map((item) => normalizeOrder(item, ctx));
  }
  return normalizeOrder(raw, ctx);
}

export const tmf641V4Adapter: VersionAdapter = {
  id: "tmf641-v4",
  apiId: "TMF641",
  major: "v4",
  normalize,
};

export const tmf641V5Adapter: VersionAdapter = {
  id: "tmf641-v5",
  apiId: "TMF641",
  major: "v5",
  normalize,
};
