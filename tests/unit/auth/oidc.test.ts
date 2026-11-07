import { describe, expect, it } from "vitest";
import {
  beginOidcLogin,
  exchangeAuthorizationCode,
  mapVerifiedClaimsToPrincipal,
} from "../../../src/server/auth/oidc/client";
import { clearOidcDiscoveryCache } from "../../../src/server/auth/oidc/discovery";
import { principalFromOidcEntitlements } from "../../../src/server/auth/oidc/entitlements";
import {
  openOidcLoginState,
  sealOidcLoginState,
} from "../../../src/server/auth/oidc/login-state";

describe("OIDC helpers", () => {
  it("builds PKCE authorize URLs from discovery endpoints", async () => {
    clearOidcDiscoveryCache();
    const started = await beginOidcLogin(
      {
        issuer: "https://idp.example/cdn-cgi/access/sso/oidc/client",
        clientId: "compass",
        redirectUri: "http://localhost:3000/api/auth/callback",
      },
      {
        discovery: {
          issuer: "https://idp.example/cdn-cgi/access/sso/oidc/client",
          authorizationEndpoint:
            "https://idp.example/cdn-cgi/access/sso/oidc/client/authorization",
          tokenEndpoint: "https://idp.example/cdn-cgi/access/sso/oidc/client/token",
          jwksUri: "https://idp.example/cdn-cgi/access/sso/oidc/client/jwks",
        },
      },
    );
    expect(started.authorizationUrl).toContain("/authorization?");
    expect(started.authorizationUrl).toContain("code_challenge");
    expect(started.authorizationUrl).toContain("openid");
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

  it("entitles only allowlisted emails", () => {
    const file = {
      schemaVersion: 1 as const,
      policyVersion: "oidc-entitlements-1",
      principals: [
        {
          email: "me@example.com",
          tenantId: "tenant-a",
          audience: "operator" as const,
          roles: ["operator"],
          allowedDeploymentIds: ["telecom-api-sandbox"],
          allowedCustomerIds: ["customer-001"],
        },
      ],
    };
    const ok = principalFromOidcEntitlements(
      {
        iss: "https://team.cloudflareaccess.com/cdn-cgi/access/sso/oidc/abc",
        sub: "cf|1",
        email: "me@example.com",
        name: "Me",
      },
      file,
    );
    expect(ok.tenantId).toBe("tenant-a");
    expect(ok.allowedDeploymentIds).toEqual(["telecom-api-sandbox"]);
    expect(() =>
      principalFromOidcEntitlements(
        {
          iss: "https://team.cloudflareaccess.com/cdn-cgi/access/sso/oidc/abc",
          sub: "cf|2",
          email: "other@example.com",
        },
        file,
      ),
    ).toThrow(/not entitled/i);
  });

  it("seals and opens login state cookies", () => {
    const sealed = sealOidcLoginState(
      {
        state: "abc",
        nonce: "n",
        codeVerifier: "v",
        returnPath: "/",
        exp: Date.now() + 60_000,
      },
      "test-secret-at-least-16",
    );
    const opened = openOidcLoginState(sealed, "test-secret-at-least-16");
    expect(opened.state).toBe("abc");
    expect(() => openOidcLoginState(sealed, "wrong-secret-value!!")).toThrow(/signature/i);
  });
});
