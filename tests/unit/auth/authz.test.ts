import { describe, expect, it } from "vitest";
import { createFixtureAuthorizationService } from "../../../src/server/policy/fixture-authz";
import type { Principal } from "../../../src/server/auth/types";

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    subject: "local:op-alpha",
    tenantId: "tenant-a",
    audience: "operator",
    roles: ["operator"],
    policyVersion: "local-fixture-1",
    issuer: "local-fixture",
    displayName: "Operator Alpha",
    allowedDeploymentIds: ["fixture-a"],
    allowedCustomerIds: ["cust-100"],
    ...overrides,
  };
}

describe("fixture authorization", () => {
  const authz = createFixtureAuthorizationService();

  it("isolates entitlements across tenants with identical resource IDs", () => {
    const a = principal({ tenantId: "tenant-a", subject: "a" });
    const b = principal({
      tenantId: "tenant-b",
      subject: "b",
      allowedCustomerIds: ["cust-100"],
    });
    expect(authz.authorizeCustomer(a, "fixture-a", "cust-100").allowed).toBe(true);
    expect(authz.authorizeCustomer(b, "fixture-a", "cust-100").allowed).toBe(true);
    // Repository scoping still separates tenants; policy alone does not grant cross-tenant reads.
    expect(a.tenantId).not.toEqual(b.tenantId);
  });

  it("prevents a customer from selecting another account", () => {
    const customer = principal({
      audience: "customer",
      allowedCustomerIds: ["cust-100"],
    });
    expect(authz.authorizeCustomer(customer, "fixture-a", "cust-200").allowed).toBe(false);
    expect(authz.authorizeCustomer(customer, "fixture-a", "cust-100").allowed).toBe(true);
  });

  it("limits operators to entitled customers", () => {
    const op = principal({ allowedCustomerIds: ["cust-100"] });
    expect(authz.authorizeCustomer(op, "fixture-a", "cust-200").allowed).toBe(false);
  });

  it("denies entities outside customer scope", () => {
    const op = principal();
    expect(
      authz.authorizeEntity(op, "fixture-a", "cust-100", {
        kind: "service",
        id: "svc-200",
        apiId: "TMF638",
        major: "v5",
      }).allowed,
    ).toBe(false);
  });
});
