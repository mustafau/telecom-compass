import "../../guard";
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Principal } from "../types";
import { discoverOidc, type OidcDiscovery } from "./discovery";

export type OidcConfig = {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  /** openid email profile — Access needs email for entitlement mapping. */
  scope?: string;
};

export type OidcAuthorizationRequest = {
  authorizationUrl: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  returnPath: string;
};

/**
 * OIDC authorization-code + PKCE. Endpoints come from discovery (Cloudflare Access
 * uses /authorization not /authorize).
 */
export async function beginOidcLogin(
  config: OidcConfig,
  options: {
    returnPath?: string;
    fetchImpl?: typeof fetch;
    discovery?: OidcDiscovery;
  } = {},
): Promise<OidcAuthorizationRequest> {
  const returnPath = sanitizeReturnPath(options.returnPath ?? "/");
  const discovery =
    options.discovery ?? (await discoverOidc(config.issuer, options.fetchImpl ?? fetch));
  const state = randomBytes(16).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const url = new URL(discovery.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scope ?? "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return {
    authorizationUrl: url.toString(),
    state,
    nonce,
    codeVerifier,
    returnPath,
  };
}

export type TokenExchangeResult = {
  idTokenClaims: Record<string, unknown>;
  accessToken: string;
};

export async function exchangeAuthorizationCode(options: {
  config: OidcConfig;
  code: string;
  codeVerifier: string;
  expectedNonce: string;
  fetchImpl?: typeof fetch;
  discovery?: OidcDiscovery;
  /** Test hook replacing network token + JWKS verification. */
  mockExchange?: () => Promise<TokenExchangeResult>;
}): Promise<TokenExchangeResult> {
  if (options.mockExchange) {
    const result = await options.mockExchange();
    if (result.idTokenClaims.nonce !== options.expectedNonce) {
      throw new Error("OIDC nonce mismatch");
    }
    return result;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const discovery =
    options.discovery ?? (await discoverOidc(options.config.issuer, fetchImpl));

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.config.redirectUri,
    client_id: options.config.clientId,
    code_verifier: options.codeVerifier,
  });
  if (options.config.clientSecret) {
    body.set("client_secret", options.config.clientSecret);
  }

  const tokenRes = await fetchImpl(discovery.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) {
    throw new Error(`OIDC token exchange failed (${tokenRes.status})`);
  }
  const json = (await tokenRes.json()) as {
    access_token?: string;
    id_token?: string;
  };
  if (!json.access_token || !json.id_token) {
    throw new Error("OIDC token response incomplete");
  }

  const jwks = createRemoteJWKSet(new URL(discovery.jwksUri));
  const verified = await jwtVerify(json.id_token, jwks, {
    issuer: discovery.issuer,
    audience: options.config.clientId,
  });
  const claims = verified.payload as Record<string, unknown>;
  if (claims.nonce !== options.expectedNonce) {
    throw new Error("OIDC nonce mismatch");
  }
  return { accessToken: json.access_token, idTokenClaims: claims };
}

/** Legacy claim-map helper retained for unit tests / IdPs that mint custom claims. */
export function mapVerifiedClaimsToPrincipal(
  claims: Record<string, unknown>,
  mapping: {
    tenantClaim: string;
    audienceClaim: string;
    rolesClaim: string;
    deploymentsClaim: string;
    customersClaim: string;
    policyVersion: string;
  },
): Principal {
  const subject = typeof claims.sub === "string" ? claims.sub : "";
  const issuer = typeof claims.iss === "string" ? claims.iss : "";
  if (!subject || !issuer) throw new Error("OIDC claims missing iss/sub");
  const tenantId = stringClaim(claims, mapping.tenantClaim);
  const audienceRaw = stringClaim(claims, mapping.audienceClaim);
  if (audienceRaw !== "operator" && audienceRaw !== "customer") {
    throw new Error("OIDC audience claim invalid");
  }
  return {
    subject,
    issuer,
    tenantId,
    audience: audienceRaw,
    roles: stringArrayClaim(claims, mapping.rolesClaim),
    policyVersion: mapping.policyVersion,
    displayName:
      (typeof claims.name === "string" && claims.name) ||
      (typeof claims.email === "string" && claims.email) ||
      subject,
    allowedDeploymentIds: stringArrayClaim(claims, mapping.deploymentsClaim),
    allowedCustomerIds: stringArrayClaim(claims, mapping.customersClaim),
  };
}

function stringClaim(claims: Record<string, unknown>, name: string): string {
  const value = claims[name];
  if (typeof value !== "string" || !value) {
    throw new Error(`Missing required claim ${name}`);
  }
  return value;
}

function stringArrayClaim(claims: Record<string, unknown>, name: string): string[] {
  const value = claims[name];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function sanitizeReturnPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) return "/";
  return path;
}
