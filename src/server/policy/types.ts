import "../guard";
import type { EntityRef } from "../domain/types";
import type { Principal } from "../auth/types";

export type AuthorizationDecision =
  | { allowed: true }
  | { allowed: false; code: "NOT_FOUND_OR_NOT_AUTHORIZED" | "FORBIDDEN"; reason: string };

export type AuthorizationService = {
  authorizeDeployment(principal: Principal, deploymentId: string): AuthorizationDecision;
  authorizeCustomer(
    principal: Principal,
    deploymentId: string,
    customerId: string,
  ): AuthorizationDecision;
  authorizeEntity(
    principal: Principal,
    deploymentId: string,
    targetCustomerId: string | undefined,
    ref: EntityRef,
  ): AuthorizationDecision;
};
