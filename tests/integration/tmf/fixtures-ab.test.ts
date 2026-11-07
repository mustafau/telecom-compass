import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Product, Service, TroubleTicket } from "../../../src/server/domain/types";
import { FIXTURE_IDS, createFixtureServer } from "../../../src/server/tmf";
import { createTmfGateway } from "../../../src/server/tmf/gateway";
import { getProfile, loadDeploymentsFile } from "../../../src/server/tmf/profile/load";
import { withRevision } from "../../../src/server/tmf/profile/revision";
import { createRelationshipResolver } from "../../../src/server/tmf/relationships/plans";

const deploymentsFile = path.resolve("config/fixtures/deployments.yaml");

async function gatewayFor(profileId: "fixture-a" | "fixture-b") {
  const variant = profileId === "fixture-a" ? "a" : "b";
  const server = createFixtureServer(variant);
  const file = await loadDeploymentsFile(deploymentsFile);
  const profile = withRevision(getProfile(file, profileId));
  const gateway = createTmfGateway({
    profile,
    resolveSecret: () => undefined,
    fetchImpl: server.fetch,
  });
  return { gateway, profile, server };
}

describe("fixture A/B normalized behavior", () => {
  it.each(["fixture-a", "fixture-b"] as const)(
    "%s returns the same business facts through different wire shapes",
    async (profileId) => {
      const { gateway, profile } = await gatewayFor(profileId);

      const customer = await gateway.read("customer.get", { id: FIXTURE_IDS.customer });
      expect(Array.isArray(customer.data)).toBe(false);
      if (Array.isArray(customer.data)) return;
      expect(customer.data.ref.id).toBe(FIXTURE_IDS.customer);
      expect(customer.data.displayName).toBe("Acme Fiber");

      const productResult = await gateway.read("product.listByCustomer", {
        "context.targetCustomerId": FIXTURE_IDS.customer,
      });
      const products = Array.isArray(productResult.data)
        ? productResult.data
        : [productResult.data];
      expect(products).toHaveLength(1);
      const product = products[0] as Product;
      expect(product.ref.id).toBe(FIXTURE_IDS.product);
      expect(product.realizingServices.map((r) => r.id)).toEqual([FIXTURE_IDS.service]);

      const serviceResult = await gateway.read("service.get", { id: FIXTURE_IDS.service });
      const service = serviceResult.data as Service;
      expect(service.enabled).toBe(true);
      expect(service.supportingResources[0]?.id).toBe(FIXTURE_IDS.resource);

      const ticketsResult = await gateway.read("ticket.listByService", {
        "args.serviceId": FIXTURE_IDS.service,
      });
      const tickets = (
        Array.isArray(ticketsResult.data) ? ticketsResult.data : [ticketsResult.data]
      ) as TroubleTicket[];
      expect(tickets[0]?.ref.id).toBe(FIXTURE_IDS.ticket);
      expect(tickets[0]?.affectedEntities[0]?.id).toBe(FIXTURE_IDS.service);

      const resolver = createRelationshipResolver(profile, gateway);
      const via = await resolver.resolve("customerToServices", customer.data, {
        "context.targetCustomerId": FIXTURE_IDS.customer,
      });
      expect(via.refs.map((r) => r.id)).toEqual([FIXTURE_IDS.service]);

      const ticketRel = await resolver.resolve("serviceToTickets", service);
      expect(ticketRel.refs.map((r) => r.id)).toEqual([FIXTURE_IDS.ticket]);
    },
  );

  it("does not invent filtered results for unsupported query params", async () => {
    const { server } = await gatewayFor("fixture-a");
    const response = await server.fetch(
      new Request("http://127.0.0.1:8789/a/productInventory/v4/product?foo=bar"),
    );
    expect(response.status).toBe(400);
  });
});
