import "../guard";
import type { EntityRef } from "../domain/types";
import type { Principal } from "../auth/types";
import type { AuthorizationDecision, AuthorizationService } from "./types";

/**
 * Local/fixture authorization: entitlements come from the principal mapping only.
 * Identical resource IDs in another tenant never grant access.
 */
export function createFixtureAuthorizationService(): AuthorizationService {
  return {
    authorizeDeployment(principal, deploymentId) {
      if (!principal.allowedDeploymentIds.includes(deploymentId)) {
        return deny("Deployment not entitled");
      }
      return allow();
    },
    authorizeCustomer(principal, deploymentId, customerId) {
      const dep = this.authorizeDeployment(principal, deploymentId);
      if (!dep.allowed) return dep;
      if (principal.audience === "customer") {
        if (principal.allowedCustomerIds.length !== 1) {
          return deny("Customer principal must map to exactly one account for auto-bind");
        }
        if (principal.allowedCustomerIds[0] !== customerId) {
          return deny("Customer cannot select another account");
        }
        return allow();
      }
      if (!principal.allowedCustomerIds.includes(customerId)) {
        return deny("Operator not entitled to customer");
      }
      return allow();
    },
    authorizeEntity(principal, deploymentId, targetCustomerId, ref) {
      const dep = this.authorizeDeployment(principal, deploymentId);
      if (!dep.allowed) return dep;
      if (!targetCustomerId) {
        return deny("Target customer required for entity authorization");
      }
      const cust = this.authorizeCustomer(principal, deploymentId, targetCustomerId);
      if (!cust.allowed) return cust;
      // Ownership for fixtures: entities under cust-100 / cust-200 namespaces by convention
      // used in tests; unknown IDs deny rather than invent ownership.
      if (!entityBelongsToCustomer(ref, targetCustomerId)) {
        return deny("Entity not in authorized customer scope");
      }
      return allow();
    },
  };
}

function entityBelongsToCustomer(ref: EntityRef, customerId: string): boolean {
  // Fixture convention: shared IDs cust-100 / svc-100 etc. belong to cust-100;
  // cust-200 owns svc-200 style IDs; cross-tenant isolation is by principal.tenantId
  // at the repository layer, not here.
  if (customerId === "cust-100") {
    return (
      ref.id === "cust-100" ||
      ref.id.endsWith("-100") ||
      ref.id === "party-100"
    );
  }
  if (customerId === "cust-200") {
    return ref.id === "cust-200" || ref.id.endsWith("-200");
  }
  return ref.id === customerId || ref.id.startsWith(`${customerId}-`);
}

function allow(): AuthorizationDecision {
  return { allowed: true };
}

function deny(reason: string): AuthorizationDecision {
  return { allowed: false, code: "NOT_FOUND_OR_NOT_AUTHORIZED", reason };
}

export function assertAuthorized(decision: AuthorizationDecision): void {
  if (!decision.allowed) {
    const err = new Error(decision.reason);
    err.name = decision.code;
    throw err;
  }
}

export type { Principal };
