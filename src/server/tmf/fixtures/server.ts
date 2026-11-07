import "../../guard";
import { Hono } from "hono";
import {
  FIXTURE_IDS,
  customerPayload,
  orderPayload,
  productPayload,
  resourcePayload,
  servicePayload,
  ticketPayload,
  type FixtureVariant,
} from "./data";

export type FixtureServer = {
  variant: FixtureVariant;
  app: Hono;
  fetch: typeof fetch;
  baseOrigin: string;
};

/**
 * In-process fixture HTTP surface. Profile A and B expose different base paths
 * and query parameter names while sharing business identifiers.
 */
export function createFixtureServer(variant: FixtureVariant): FixtureServer {
  const app = new Hono();
  const baseOrigin = "http://127.0.0.1:8789";

  if (variant === "a") {
    mountProfileA(app);
  } else {
    mountProfileB(app);
  }

  const fetchImpl: typeof fetch = async (input, init) => {
    const request =
      typeof input === "string" || input instanceof URL
        ? new Request(input, init)
        : input;
    return app.request(request);
  };

  return { variant, app, fetch: fetchImpl, baseOrigin };
}

function mountProfileA(app: Hono): void {
  app.get("/a/customer/v4/customer/:id", (c) => {
    if (c.req.param("id") !== FIXTURE_IDS.customer) return c.json({ code: "notFound" }, 404);
    return c.json(customerPayload("a"));
  });

  app.get("/a/productInventory/v4/product/:id", (c) => {
    if (c.req.param("id") !== FIXTURE_IDS.product) return c.json({ code: "notFound" }, 404);
    return c.json(productPayload("a"));
  });

  app.get("/a/productInventory/v4/product", (c) => {
    const customerId = c.req.query("relatedParty.id");
    if (!customerId) return c.json({ error: "unsupported filter" }, 400);
    if (customerId !== FIXTURE_IDS.customer) return c.json([]);
    return c.json([productPayload("a")]);
  });

  app.get("/a/serviceInventory/v5/service/:id", (c) => {
    if (c.req.param("id") !== FIXTURE_IDS.service) return c.json({ code: "notFound" }, 404);
    return c.json(servicePayload("a"));
  });

  app.get("/a/resourceInventory/v4/resource/:id", (c) => {
    if (c.req.param("id") !== FIXTURE_IDS.resource) return c.json({ code: "notFound" }, 404);
    return c.json(resourcePayload("a"));
  });

  app.get("/a/troubleTicket/v4/troubleTicket/:id", (c) => {
    if (c.req.param("id") !== FIXTURE_IDS.ticket) return c.json({ code: "notFound" }, 404);
    return c.json(ticketPayload("a"));
  });

  app.get("/a/troubleTicket/v4/troubleTicket", (c) => {
    const serviceId = c.req.query("relatedEntity.id");
    if (!serviceId) return c.json({ error: "unsupported filter" }, 400);
    if (serviceId !== FIXTURE_IDS.service) return c.json([]);
    return c.json([ticketPayload("a")]);
  });

  app.get("/a/serviceOrdering/v4/serviceOrder/:id", (c) => {
    if (c.req.param("id") !== FIXTURE_IDS.order) return c.json({ code: "notFound" }, 404);
    return c.json(orderPayload());
  });

  // Mutation endpoints exist only to prove Compass never calls them.
  app.post("/a/customer/v4/customer", (c) => c.json({ ok: true }, 201));
  app.all("/a/redirect", (c) => c.redirect("https://evil.example/steal", 302));
}

function mountProfileB(app: Hono): void {
  app.get("/b/tmf/customerManagement/v5/customer/:id", (c) => {
    if (c.req.param("id") !== FIXTURE_IDS.customer) return c.json({ code: "notFound" }, 404);
    return c.json(customerPayload("b"));
  });

  app.get("/b/tmf/productInventory/v5/product/:id", (c) => {
    if (c.req.param("id") !== FIXTURE_IDS.product) return c.json({ code: "notFound" }, 404);
    return c.json(productPayload("b"));
  });

  app.get("/b/tmf/productInventory/v5/product", (c) => {
    // Different query name than profile A
    const customerId = c.req.query("customer.id");
    if (!customerId) return c.json({ error: "unsupported filter" }, 400);
    if (customerId !== FIXTURE_IDS.customer) return c.json([]);
    return c.json({ items: [productPayload("b")] });
  });

  app.get("/b/tmf/serviceInventory/v5/service/:id", (c) => {
    if (c.req.param("id") !== FIXTURE_IDS.service) return c.json({ code: "notFound" }, 404);
    return c.json(servicePayload("b"));
  });

  app.get("/b/tmf/resourceInventory/v5/resource/:id", (c) => {
    if (c.req.param("id") !== FIXTURE_IDS.resource) return c.json({ code: "notFound" }, 404);
    return c.json(resourcePayload("b"));
  });

  app.get("/b/tmf/troubleTicket/v5/troubleTicket/:id", (c) => {
    if (c.req.param("id") !== FIXTURE_IDS.ticket) return c.json({ code: "notFound" }, 404);
    return c.json(ticketPayload("b"));
  });

  app.get("/b/tmf/troubleTicket/v5/troubleTicket", (c) => {
    const serviceId = c.req.query("affectedService.id");
    if (!serviceId) return c.json({ error: "unsupported filter" }, 400);
    if (serviceId !== FIXTURE_IDS.service) return c.json({ items: [] });
    return c.json({ items: [ticketPayload("b")] });
  });

  app.get("/b/tmf/serviceOrdering/v5/serviceOrder/:id", (c) => {
    if (c.req.param("id") !== FIXTURE_IDS.order) return c.json({ code: "notFound" }, 404);
    return c.json(orderPayload());
  });
}
