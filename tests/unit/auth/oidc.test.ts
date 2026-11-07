import { describe, expect, it } from "vitest";
import {
  beginOidcLogin,
  exchangeAuthorizationCode,
  mapVerifiedClaimsToPrincipal,
} from "../../../src/server/auth/oidc/client";

describe("OIDC helpers", () => {
  it("builds PKCE authorize URLs", () => {
    const started = beginOidcLogin({
      issuer: "https://idp.example",
      clientId: "compass",
      redirectUri: "http://localhost:3000/api/auth/callback",
    });
    expect(started.authorizationUrl).toContain("code_challenge");
    expect(started.codeVerifier.length).toBeGreaterThan(20);
  });

  it("maps verified claims and rejects nonce mismatch", async () => {
    const principal = mapVerifiedClaimsToPrincipal(
      {
        iss: "https://idp.example",
        sub: "user-1",
        tenant_id: "tenant-a",
        compass_audience: "operator",
        roles: ["operator"],
        deployments: ["fixture-a"],
        customers: ["cust-100"],
        name: "Pat",
      },
      {
        tenantClaim: "tenant_id",
        audienceClaim: "compass_audience",
        rolesClaim: "roles",
        deploymentsClaim: "deployments",
        customersClaim: "customers",
        policyVersion: "oidc-claims-1",
      },
    );
    expect(principal.subject).toBe("user-1");
    expect(principal.allowedCustomerIds).toEqual(["cust-100"]);

    await expect(
      exchangeAuthorizationCode({
        config: {
          issuer: "https://idp.example",
          clientId: "compass",
          redirectUri: "http://localhost:3000/api/auth/callback",
        },
        code: "x",
        codeVerifier: "y",
        expectedNonce: "n1",
        mockExchange: async () => ({
          accessToken: "a",
          idTokenClaims: { nonce: "other" },
        }),
      }),
    ).rejects.toThrow(/nonce/i);
  });
});
