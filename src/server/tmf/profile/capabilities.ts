import "../../guard";
import type { CapabilityFlags, DeploymentProfile } from "./schema";
import { buildOperationRegistry } from "../registry/operations";

const OPERATION_REQUIREMENTS: Partial<Record<keyof CapabilityFlags, string[]>> = {
  customerRead: ["customer.get"],
  productRead: ["product.get"],
  serviceRead: ["service.get"],
  resourceRead: ["resource.get"],
  ticketRead: ["ticket.get"],
  serviceOrderRead: ["order.get"],
  customerToServices: ["product.listByCustomer"],
  serviceToTickets: ["ticket.listByService"],
  serviceToOrders: ["order.get"],
};

/**
 * Capabilities claimed in the profile cannot enable missing operations.
 * Returns effective flags and the list of capabilities forced off.
 */
export function deriveEffectiveCapabilities(profile: DeploymentProfile): {
  effective: CapabilityFlags;
  disabled: Array<{ capability: keyof CapabilityFlags; reason: string }>;
} {
  const registry = buildOperationRegistry(profile);
  const effective = { ...profile.capabilities };
  const disabled: Array<{ capability: keyof CapabilityFlags; reason: string }> = [];

  for (const [capability, requiredOps] of Object.entries(OPERATION_REQUIREMENTS) as Array<
    [keyof CapabilityFlags, string[]]
  >) {
    if (!effective[capability]) continue;
    const missing = requiredOps.filter((op) => !registry.has(op));
    if (missing.length > 0) {
      effective[capability] = false;
      disabled.push({
        capability,
        reason: `Missing required operation(s): ${missing.join(", ")}`,
      });
    }
  }

  // Relationship plans must also exist when customerToServices / serviceToTickets claimed
  if (effective.customerToServices && !profile.relationships.customerToServices) {
    effective.customerToServices = false;
    disabled.push({
      capability: "customerToServices",
      reason: "Missing relationship plan customerToServices",
    });
  }
  if (effective.serviceToTickets && !profile.relationships.serviceToTickets) {
    effective.serviceToTickets = false;
    disabled.push({
      capability: "serviceToTickets",
      reason: "Missing relationship plan serviceToTickets",
    });
  }
  if (effective.serviceToOrders && !profile.relationships.serviceToOrders) {
    effective.serviceToOrders = false;
    disabled.push({
      capability: "serviceToOrders",
      reason: "Missing relationship plan serviceToOrders",
    });
  }

  if (effective.knowledgeSearch && profile.knowledge.type === "disabled") {
    effective.knowledgeSearch = false;
    disabled.push({
      capability: "knowledgeSearch",
      reason: "Knowledge source is disabled",
    });
  }

  return { effective, disabled };
}
