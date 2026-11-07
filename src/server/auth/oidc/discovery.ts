import "../../guard";

export type OidcDiscovery = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint?: string;
};

const cache = new Map<string, { at: number; value: OidcDiscovery }>();
const CACHE_MS = 10 * 60_000;

export async function discoverOidc(
  issuer: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OidcDiscovery> {
  const key = issuer.replace(/\/$/, "");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const url = `${key}/.well-known/openid-configuration`;
  const res = await fetchImpl(url, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed (${res.status}) at ${url}`);
  }
  const json = (await res.json()) as Record<string, unknown>;
  const discoveredIssuer = typeof json.issuer === "string" ? json.issuer.replace(/\/$/, "") : "";
  if (!discoveredIssuer || discoveredIssuer !== key) {
    throw new Error(
      `OIDC discovery issuer mismatch: expected ${key}, got ${discoveredIssuer || "(missing)"}`,
    );
  }
  const authorizationEndpoint =
    typeof json.authorization_endpoint === "string" ? json.authorization_endpoint : "";
  const tokenEndpoint = typeof json.token_endpoint === "string" ? json.token_endpoint : "";
  const jwksUri = typeof json.jwks_uri === "string" ? json.jwks_uri : "";
  if (!authorizationEndpoint || !tokenEndpoint || !jwksUri) {
    throw new Error("OIDC discovery missing authorization_endpoint, token_endpoint, or jwks_uri");
  }
  const value: OidcDiscovery = {
    issuer: discoveredIssuer,
    authorizationEndpoint,
    tokenEndpoint,
    jwksUri,
    userinfoEndpoint:
      typeof json.userinfo_endpoint === "string" ? json.userinfo_endpoint : undefined,
  };
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Test helper. */
export function clearOidcDiscoveryCache(): void {
  cache.clear();
}
