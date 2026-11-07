import "../guard";
import { tool } from "ai";
import { z } from "zod";
import type { DomainServices } from "../domain/services/catalog";
import type { ExecutionContext } from "../domain/execution";
import type { EvidenceLedger } from "../evidence/ledger";
import type { CheckedProfile } from "../tmf/profile/revision";

export type DomainToolContext = {
  services: DomainServices;
  profile: CheckedProfile;
  ctx: ExecutionContext;
  ledger: EvidenceLedger;
};

/**
 * Native AI SDK tools wrapping domain services. Authorization, evidence
 * recording and budgets stay inside the service layer.
 */
export function createDomainTools(deps: DomainToolContext) {
  const { services, profile, ctx, ledger } = deps;

  const getCustomerOverview = profile.capabilities.customerRead
    ? tool({
        description:
          "Fetch the authorized overview for the conversation's target customer (no customer id argument).",
        inputSchema: z.object({}),
        execute: async () => sanitizeToolResult(await services.getCustomerOverview(ctx, ledger)),
      })
    : undefined;

  const getServiceDetails = profile.capabilities.serviceRead
    ? tool({
        description:
          "Fetch authorized service details by service id (e.g. service-001 or svc-100).",
        inputSchema: z.object({
          serviceId: z.string().min(1).max(128),
        }),
        execute: async ({ serviceId }) =>
          sanitizeToolResult(await services.getServiceDetails(ctx, ledger, serviceId)),
      })
    : undefined;

  const diagnoseService = profile.capabilities.serviceRead
    ? tool({
        description:
          "Diagnose a service: lifecycle/enabled plus related tickets/orders when the profile allows.",
        inputSchema: z.object({
          serviceId: z.string().min(1).max(128),
        }),
        execute: async ({ serviceId }) =>
          sanitizeToolResult(await services.diagnoseService(ctx, ledger, serviceId)),
      })
    : undefined;

  const getTroubleTicket = profile.capabilities.ticketRead
    ? tool({
        description: "Fetch an authorized trouble ticket by id.",
        inputSchema: z.object({
          ticketId: z.string().min(1).max(128),
        }),
        execute: async ({ ticketId }) =>
          sanitizeToolResult(await services.getTroubleTicket(ctx, ledger, ticketId)),
      })
    : undefined;

  const getServiceOrder = profile.capabilities.serviceOrderRead
    ? tool({
        description: "Fetch an authorized service order by id.",
        inputSchema: z.object({
          orderId: z.string().min(1).max(128),
        }),
        execute: async ({ orderId }) =>
          sanitizeToolResult(await services.getServiceOrder(ctx, ledger, orderId)),
      })
    : undefined;

  return {
    ...(getCustomerOverview ? { getCustomerOverview } : {}),
    ...(getServiceDetails ? { getServiceDetails } : {}),
    ...(diagnoseService ? { diagnoseService } : {}),
    ...(getTroubleTicket ? { getTroubleTicket } : {}),
    ...(getServiceOrder ? { getServiceOrder } : {}),
  };
}

function sanitizeToolResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as {
    status?: string;
    evidenceIds?: string[];
    completeness?: string;
    warnings?: string[];
    userMessage?: string;
    code?: string;
    retryable?: boolean;
    data?: unknown;
  };
  if (r.status === "unavailable") {
    return {
      status: r.status,
      code: r.code,
      retryable: r.retryable ?? false,
      evidenceIds: r.evidenceIds ?? [],
      userMessage: r.userMessage,
    };
  }
  return {
    status: r.status,
    evidenceIds: r.evidenceIds ?? [],
    completeness: r.completeness,
    warnings: r.warnings ?? [],
    summary: summarizeData(r.data),
  };
}

function summarizeData(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  if ("customer" in d && d.customer && typeof d.customer === "object") {
    const customer = d.customer as {
      ref?: { id?: string };
      displayName?: string;
      status?: { raw?: string };
    };
    return {
      customerId: customer.ref?.id,
      displayName: customer.displayName,
      status: customer.status?.raw ?? null,
      productCount: d.productCount,
      serviceCount: d.serviceCount,
    };
  }
  if ("ref" in d && (d as { ref?: { kind?: string } }).ref?.kind === "service") {
    const service = d as {
      ref: { id: string };
      displayName?: string;
      lifecycleState?: { raw?: string };
      enabled?: boolean | null;
    };
    return {
      serviceId: service.ref.id,
      displayName: service.displayName,
      lifecycleState: service.lifecycleState?.raw ?? null,
      enabled: service.enabled ?? null,
    };
  }
  if ("service" in d && d.service && typeof d.service === "object") {
    const service = d.service as {
      ref?: { id?: string };
      displayName?: string;
      lifecycleState?: { raw?: string };
      enabled?: boolean | null;
    };
    const tickets = Array.isArray(d.tickets)
      ? (d.tickets as Array<{ ref?: { id?: string }; status?: { raw?: string } }>).map((t) => ({
          ticketId: t.ref?.id,
          status: t.status?.raw ?? null,
        }))
      : [];
    const orders = Array.isArray(d.orders)
      ? (d.orders as Array<{ ref?: { id?: string }; state?: { raw?: string } }>).map((o) => ({
          orderId: o.ref?.id,
          state: o.state?.raw ?? null,
        }))
      : [];
    return {
      serviceId: service.ref?.id,
      displayName: service.displayName,
      lifecycleState: service.lifecycleState?.raw ?? null,
      enabled: service.enabled ?? null,
      tickets,
      orders,
      gaps: d.gaps,
    };
  }
  if ("ref" in d) {
    const entity = d as {
      ref?: { kind?: string; id?: string };
      status?: { raw?: string };
      state?: { raw?: string };
      severity?: string | null;
      customerVisibleDescription?: string | null;
      expectedResolution?: { at?: string } | null;
      expectedCompletion?: { at?: string } | null;
    };
    return {
      kind: entity.ref?.kind,
      id: entity.ref?.id,
      status: entity.status?.raw ?? entity.state?.raw ?? null,
      severity: entity.severity ?? null,
      description: entity.customerVisibleDescription ?? null,
      expectedResolution: entity.expectedResolution?.at ?? null,
      expectedCompletion: entity.expectedCompletion?.at ?? null,
    };
  }
  return { keys: Object.keys(d) };
}
