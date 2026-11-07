import { describe, expect, it } from "vitest";
import type { Product, Service, TroubleTicket } from "../../../src/server/domain/types";
import { tmf621V4Adapter, tmf621V5Adapter } from "../../../src/server/tmf/adapters/tmf621";
import { tmf637V4Adapter, tmf637V5Adapter } from "../../../src/server/tmf/adapters/tmf637";
import { tmf638V5Adapter } from "../../../src/server/tmf/adapters/tmf638";
import {
  FIXTURE_IDS,
  productPayload,
  servicePayload,
  ticketPayload,
} from "../../../src/server/tmf/fixtures/data";

const source = {
  deploymentId: "fixture-a",
  profileRevision: "abc",
  contractRef: "fixture",
  operationKey: "x",
  retrievedAt: "2026-11-01T00:00:00.000Z",
  quality: "fixture" as const,
};

describe("version adapters", () => {
  it("normalizes product realizing services from v4 and v5 shapes", () => {
    const a = tmf637V4Adapter.normalize(productPayload("a"), {
      source,
      apiId: "TMF637",
      major: "v4",
      responseKind: "product",
    }) as Product;
    const b = tmf637V5Adapter.normalize(productPayload("b"), {
      source,
      apiId: "TMF637",
      major: "v5",
      responseKind: "product",
    }) as Product;
    expect(a.realizingServices.map((r) => r.id)).toEqual([FIXTURE_IDS.service]);
    expect(b.realizingServices.map((r) => r.id)).toEqual([FIXTURE_IDS.service]);
    expect(a.lifecycleState?.raw).toBe("active");
    expect(b.lifecycleState?.raw).toBe("active");
  });

  it("keeps lifecycle and enabled separate on services", () => {
    const a = tmf638V5Adapter.normalize(servicePayload("a"), {
      source,
      apiId: "TMF638",
      major: "v5",
      responseKind: "service",
    }) as Service;
    const b = tmf638V5Adapter.normalize(servicePayload("b"), {
      source,
      apiId: "TMF638",
      major: "v5",
      responseKind: "service",
    }) as Service;
    expect(a.enabled).toBe(true);
    expect(b.enabled).toBe(true);
    expect(a.supportingResources[0]?.id).toBe(FIXTURE_IDS.resource);
    expect(b.supportingResources[0]?.id).toBe(FIXTURE_IDS.resource);
    expect(a.serviceOrders[0]?.id).toBe(FIXTURE_IDS.order);
    expect(b.serviceOrders[0]?.id).toBe(FIXTURE_IDS.order);
  });

  it("normalizes ticket relatedEntity direct and nested forms", () => {
    const a = tmf621V4Adapter.normalize(ticketPayload("a"), {
      source,
      apiId: "TMF621",
      major: "v4",
      responseKind: "troubleTicket",
    }) as TroubleTicket;
    const b = tmf621V5Adapter.normalize(ticketPayload("b"), {
      source,
      apiId: "TMF621",
      major: "v5",
      responseKind: "troubleTicket",
    }) as TroubleTicket;
    expect(a.affectedEntities.map((e) => e.id)).toEqual([FIXTURE_IDS.service]);
    expect(b.affectedEntities.map((e) => e.id)).toEqual([FIXTURE_IDS.service]);
    expect(a.expectedResolution?.type).toBe("estimate");
    expect(b.severity).toBe("major");
  });

  it("leaves absent optional relations unknown rather than empty-complete", () => {
    const sparse = tmf638V5Adapter.normalize(
      { id: "svc-x", name: "Sparse" },
      { source, apiId: "TMF638", major: "v5", responseKind: "service" },
    ) as Service;
    expect(sparse.supportingResources).toEqual([]);
    expect(sparse.relationsComplete).toBe(false);
    expect(sparse.warnings.length).toBeGreaterThan(0);
  });
});
