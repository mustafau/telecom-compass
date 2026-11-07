import "../guard";

export type Audience = "operator" | "customer";

export type Principal = Readonly<{
  subject: string;
  tenantId: string;
  audience: Audience;
  roles: readonly string[];
  policyVersion: string;
  issuer: string;
  displayName: string;
  allowedDeploymentIds: readonly string[];
  /** Customer IDs this principal may target. Empty for operators with enterprise lookup. */
  allowedCustomerIds: readonly string[];
}>;

export type SessionRecord = {
  id: string;
  tokenHash: string;
  principal: Principal;
  expiresAt: Date;
  idleExpiresAt: Date;
  policyCheckedAt: Date;
};
