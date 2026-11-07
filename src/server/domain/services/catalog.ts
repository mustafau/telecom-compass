import "../../guard";
import type { AuthorizationService } from "../../policy/types";
import { assertAuthorized } from "../../policy/fixture-authz";
import type { TmfGateway } from "../../tmf/gateway";
import type { CheckedProfile } from "../../tmf/profile/revision";
import { createRelationshipResolver } from "../../tmf/relationships/plans";
import type { Customer, Service, TroubleTicket, ServiceOrder, Product } from "../types";
import type { ExecutionContext } from "../execution";
import type { EvidenceLedger } from "../../evidence/ledger";
import { projectForAudience } from "../../evidence/ledger";

export type ToolResult<T> =
  | {
      status: "ok" | "partial";
      data: T;
      evidenceIds: string[];
      completeness: "complete" | "partial" | "unknown";
      warnings: string[];
    }
  | {
      status: "unavailable";
      code: string;
      retryable: boolean;
      evidenceIds: string[];
      userMessage: string;
    };

export type DomainServices = {
  getCustomerOverview(ctx: ExecutionContext, ledger: EvidenceLedger): Promise<ToolResult<{
    customer: Customer;
    productCount?: number;
    serviceCount?: number;
  }>>;
  getServiceDetails(
    ctx: ExecutionContext,
    ledger: EvidenceLedger,
    serviceId: string,
  ): Promise<ToolResult<Service>>;
  diagnoseService(
    ctx: ExecutionContext,
    ledger: EvidenceLedger,
    serviceId: string,
  ): Promise<
    ToolResult<{
      service: Service;
      tickets: TroubleTicket[];
      orders: ServiceOrder[];
      gaps: Array<{ capability: string; reason: string }>;
    }>
  >;
  getTroubleTicket(
    ctx: ExecutionContext,
    ledger: EvidenceLedger,
    ticketId: string,
  ): Promise<ToolResult<TroubleTicket>>;
  getServiceOrder(
    ctx: ExecutionContext,
    ledger: EvidenceLedger,
    orderId: string,
  ): Promise<ToolResult<ServiceOrder>>;
};

export function createDomainServices(options: {
  profile: CheckedProfile;
  gateway: TmfGateway;
  authz: AuthorizationService;
}): DomainServices {
  const { profile, gateway, authz } = options;
  const relationships = createRelationshipResolver(profile, gateway);

  return {
    async getCustomerOverview(ctx, ledger) {
      if (!ctx.targetCustomerId) {
        return unavailable("clarification", "Select a customer before asking for an overview");
      }
      assertAuthorized(
        authz.authorizeCustomer(ctx.principal, ctx.deploymentId, ctx.targetCustomerId),
      );
      if (!profile.capabilities.customerRead) {
        return unavailable("CAPABILITY_UNAVAILABLE", "Customer read is not available");
      }
      ctx.budget.reserveTool();
      ctx.budget.reserveHttpAttempt();
      const result = await gateway.read("customer.get", { id: ctx.targetCustomerId });
      const customer = asSingle(result.data) as Customer;
      assertAuthorized(
        authz.authorizeEntity(
          ctx.principal,
          ctx.deploymentId,
          ctx.targetCustomerId,
          customer.ref,
        ),
      );
      const fields = projectForAudience(
        {
          id: customer.ref.id,
          displayName: customer.displayName,
          status: customer.status?.raw ?? null,
        },
        ctx.principal.audience,
      );
      const evidence = await ledger.record({
        kind: "tmf-record",
        entity: customer.ref,
        fields,
        visibility: ctx.principal.audience,
        sourceLocator: `op:customer.get:${customer.ref.id}`,
      });

      let productCount: number | undefined;
      let serviceCount: number | undefined;
      const warnings: string[] = [];
      if (profile.capabilities.customerToServices) {
        try {
          const via = await relationships.resolve("customerToServices", customer, {
            "context.targetCustomerId": ctx.targetCustomerId,
          });
          serviceCount = via.refs.length;
          if (via.completeness !== "complete") {
            warnings.push("Service list completeness is not guaranteed");
            serviceCount = undefined;
          }
        } catch {
          warnings.push("customerToServices unavailable");
        }
      }

      return {
        status: warnings.length ? "partial" : "ok",
        data: { customer, productCount, serviceCount },
        evidenceIds: [evidence.id],
        completeness: warnings.length ? "partial" : "complete",
        warnings,
      };
    },

    async getServiceDetails(ctx, ledger, serviceId) {
      if (!profile.capabilities.serviceRead) {
        return unavailable("CAPABILITY_UNAVAILABLE", "Service read is not available");
      }
      ctx.budget.reserveTool();
      ctx.budget.reserveHttpAttempt();
      const result = await gateway.read("service.get", { id: serviceId });
      const service = asSingle(result.data) as Service;
      assertAuthorized(
        authz.authorizeEntity(
          ctx.principal,
          ctx.deploymentId,
          ctx.targetCustomerId,
          service.ref,
        ),
      );
      const fields = projectForAudience(
        {
          id: service.ref.id,
          displayName: service.displayName,
          lifecycleState: service.lifecycleState?.raw ?? null,
          enabled: service.enabled ?? null,
          supportingResources:
            ctx.principal.audience === "operator"
              ? service.supportingResources.map((r) => r.id)
              : undefined,
          relationsComplete: service.relationsComplete,
        },
        ctx.principal.audience,
      );
      const evidence = await ledger.record({
        kind: "tmf-record",
        entity: service.ref,
        fields,
        visibility: ctx.principal.audience,
        sourceLocator: `op:service.get:${service.ref.id}`,
      });
      return {
        status: "ok",
        data: service,
        evidenceIds: [evidence.id],
        completeness: service.relationsComplete ? "complete" : "unknown",
        warnings: service.warnings,
      };
    },

    async diagnoseService(ctx, ledger, serviceId) {
      const details = await this.getServiceDetails(ctx, ledger, serviceId);
      if (details.status === "unavailable") return details;
      const service = details.data;
      const gaps: Array<{ capability: string; reason: string }> = [];
      const tickets: TroubleTicket[] = [];
      const orders: ServiceOrder[] = [];
      const evidenceIds = [...details.evidenceIds];

      if (profile.capabilities.serviceToTickets) {
        try {
          ctx.budget.reserveHttpAttempt();
          const rel = await relationships.resolve("serviceToTickets", service);
          for (const ref of rel.refs.slice(0, profile.limits.maxRelatedRecordsPerKind)) {
            const ticketResult = await gateway.read("ticket.get", { id: ref.id });
            const ticket = asSingle(ticketResult.data) as TroubleTicket;
            assertAuthorized(
              authz.authorizeEntity(
                ctx.principal,
                ctx.deploymentId,
                ctx.targetCustomerId,
                ticket.ref,
              ),
            );
            tickets.push(ticket);
            const ev = await ledger.record({
              kind: "tmf-record",
              entity: ticket.ref,
              fields: projectForAudience(
                {
                  id: ticket.ref.id,
                  status: ticket.status?.raw ?? null,
                  severity: ticket.severity ?? null,
                  description: ticket.customerVisibleDescription ?? null,
                  expectedResolution: ticket.expectedResolution?.at ?? null,
                },
                ctx.principal.audience,
              ),
              visibility: ctx.principal.audience,
              sourceLocator: `op:ticket.get:${ticket.ref.id}`,
            });
            evidenceIds.push(ev.id);
          }
        } catch (error) {
          gaps.push({
            capability: "serviceToTickets",
            reason: error instanceof Error ? error.message : "unavailable",
          });
        }
      } else {
        gaps.push({ capability: "serviceToTickets", reason: "Capability disabled" });
      }

      if (profile.capabilities.serviceToOrders) {
        for (const ref of service.serviceOrders.slice(
          0,
          profile.limits.maxRelatedRecordsPerKind,
        )) {
          try {
            ctx.budget.reserveHttpAttempt();
            const orderResult = await gateway.read("order.get", { id: ref.id });
            const order = asSingle(orderResult.data) as ServiceOrder;
            orders.push(order);
            const ev = await ledger.record({
              kind: "tmf-record",
              entity: order.ref,
              fields: projectForAudience(
                {
                  id: order.ref.id,
                  state: order.state?.raw ?? null,
                  expectedCompletion: order.expectedCompletion?.at ?? null,
                },
                ctx.principal.audience,
              ),
              visibility: ctx.principal.audience,
              sourceLocator: `op:order.get:${order.ref.id}`,
            });
            evidenceIds.push(ev.id);
          } catch (error) {
            gaps.push({
              capability: "serviceToOrders",
              reason: error instanceof Error ? error.message : "unavailable",
            });
          }
        }
      }

      return {
        status: gaps.length ? "partial" : "ok",
        data: { service, tickets, orders, gaps },
        evidenceIds,
        completeness: gaps.length ? "partial" : "complete",
        warnings: gaps.map((g) => `${g.capability}: ${g.reason}`),
      };
    },

    async getTroubleTicket(ctx, ledger, ticketId) {
      if (!profile.capabilities.ticketRead) {
        return unavailable("CAPABILITY_UNAVAILABLE", "Ticket read is not available");
      }
      ctx.budget.reserveTool();
      ctx.budget.reserveHttpAttempt();
      const result = await gateway.read("ticket.get", { id: ticketId });
      const ticket = asSingle(result.data) as TroubleTicket;
      assertAuthorized(
        authz.authorizeEntity(
          ctx.principal,
          ctx.deploymentId,
          ctx.targetCustomerId,
          ticket.ref,
        ),
      );
      const evidence = await ledger.record({
        kind: "tmf-record",
        entity: ticket.ref,
        fields: projectForAudience(
          {
            id: ticket.ref.id,
            status: ticket.status?.raw ?? null,
            severity: ticket.severity ?? null,
            description: ticket.customerVisibleDescription ?? null,
            expectedResolution: ticket.expectedResolution?.at ?? null,
          },
          ctx.principal.audience,
        ),
        visibility: ctx.principal.audience,
        sourceLocator: `op:ticket.get:${ticket.ref.id}`,
      });
      return {
        status: "ok",
        data: ticket,
        evidenceIds: [evidence.id],
        completeness: ticket.relationsComplete ? "complete" : "unknown",
        warnings: ticket.warnings,
      };
    },

    async getServiceOrder(ctx, ledger, orderId) {
      if (!profile.capabilities.serviceOrderRead) {
        return unavailable("CAPABILITY_UNAVAILABLE", "Service order read is not available");
      }
      ctx.budget.reserveTool();
      ctx.budget.reserveHttpAttempt();
      const result = await gateway.read("order.get", { id: orderId });
      const order = asSingle(result.data) as ServiceOrder;
      assertAuthorized(
        authz.authorizeEntity(
          ctx.principal,
          ctx.deploymentId,
          ctx.targetCustomerId,
          order.ref,
        ),
      );
      const evidence = await ledger.record({
        kind: "tmf-record",
        entity: order.ref,
        fields: projectForAudience(
          {
            id: order.ref.id,
            state: order.state?.raw ?? null,
            expectedCompletion: order.expectedCompletion?.at ?? null,
            itemsComplete: order.itemsComplete,
          },
          ctx.principal.audience,
        ),
        visibility: ctx.principal.audience,
        sourceLocator: `op:order.get:${order.ref.id}`,
      });
      return {
        status: "ok",
        data: order,
        evidenceIds: [evidence.id],
        completeness: order.itemsComplete ? "complete" : "unknown",
        warnings: order.warnings,
      };
    },
  };
}

function asSingle<T>(data: T | T[]): T {
  return Array.isArray(data) ? (data[0] as T) : data;
}

function unavailable(code: string, userMessage: string): ToolResult<never> {
  return { status: "unavailable", code, retryable: false, evidenceIds: [], userMessage };
}

export type { Product };
