import "../../guard";

/** Shared business meaning across fixture profiles A/B (different wire shapes). */
export const FIXTURE_IDS = {
  customer: "cust-100",
  product: "prod-100",
  service: "svc-100",
  resource: "res-100",
  ticket: "tkt-100",
  order: "ord-100",
} as const;

export type FixtureVariant = "a" | "b";

export function customerPayload(variant: FixtureVariant): Record<string, unknown> {
  if (variant === "a") {
    return {
      id: FIXTURE_IDS.customer,
      name: "Acme Fiber",
      status: "active",
      relatedParty: [{ id: "party-100", role: "customer", "@referredType": "Party" }],
    };
  }
  return {
    id: FIXTURE_IDS.customer,
    name: "Acme Fiber",
    status: "active",
    relatedParty: [
      {
        role: "customer",
        partyOrPartyRole: { id: "party-100", "@type": "PartyRef" },
      },
    ],
  };
}

export function productPayload(variant: FixtureVariant): Record<string, unknown> {
  if (variant === "a") {
    return {
      id: FIXTURE_IDS.product,
      name: "Fiber 1G",
      status: "active",
      relatedParty: [{ id: FIXTURE_IDS.customer, role: "customer", "@referredType": "Customer" }],
      realizingService: [{ id: FIXTURE_IDS.service, "@referredType": "Service" }],
    };
  }
  return {
    id: FIXTURE_IDS.product,
    name: "Fiber 1G",
    lifecycleStatus: "active",
    relatedParty: [
      {
        role: "customer",
        partyOrPartyRole: { id: FIXTURE_IDS.customer, "@type": "Customer" },
      },
    ],
    realizingServices: [{ id: FIXTURE_IDS.service, "@type": "ServiceRef" }],
  };
}

export function servicePayload(variant: FixtureVariant): Record<string, unknown> {
  if (variant === "a") {
    return {
      id: FIXTURE_IDS.service,
      name: "Access Circuit",
      state: "active",
      isServiceEnabled: true,
      supportingResource: [{ id: FIXTURE_IDS.resource, "@referredType": "Resource" }],
      serviceOrder: [{ id: FIXTURE_IDS.order, "@referredType": "ServiceOrder" }],
    };
  }
  return {
    id: FIXTURE_IDS.service,
    name: "Access Circuit",
    lifecycleStatus: "active",
    enabled: true,
    supportingResources: [{ id: FIXTURE_IDS.resource, "@type": "ResourceRef" }],
    serviceOrders: [{ id: FIXTURE_IDS.order, "@type": "ServiceOrderRef" }],
  };
}

export function resourcePayload(variant: FixtureVariant): Record<string, unknown> {
  if (variant === "a") {
    return {
      id: FIXTURE_IDS.resource,
      name: "OLT Port",
      resourceStatus: "unavailable",
    };
  }
  return {
    id: FIXTURE_IDS.resource,
    name: "OLT Port",
    operationalState: "unavailable",
  };
}

export function ticketPayload(variant: FixtureVariant): Record<string, unknown> {
  if (variant === "a") {
    return {
      id: FIXTURE_IDS.ticket,
      name: "Fiber outage",
      status: "inProgress",
      severity: "major",
      description: "No light on ONT",
      relatedEntity: [
        { id: FIXTURE_IDS.service, role: "affected", "@referredType": "Service" },
      ],
      expectedResolutionDate: "2026-11-02T18:00:00Z",
    };
  }
  return {
    id: FIXTURE_IDS.ticket,
    name: "Fiber outage",
    status: "inProgress",
    priority: "major",
    description: "No light on ONT",
    relatedEntity: [
      {
        role: "affected",
        entity: { id: FIXTURE_IDS.service, "@referredType": "Service" },
      },
    ],
    expectedResolutionDate: "2026-11-02T18:00:00Z",
  };
}

export function orderPayload(): Record<string, unknown> {
  return {
    id: FIXTURE_IDS.order,
    description: "Restore access",
    state: "inProgress",
    expectedCompletionDate: "2026-11-02T20:00:00Z",
    serviceOrderItem: [
      {
        id: "item-1",
        action: "modify",
        state: "inProgress",
        service: { id: FIXTURE_IDS.service },
      },
    ],
  };
}
