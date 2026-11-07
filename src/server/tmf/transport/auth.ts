import "../../guard";
import { TmfError } from "../errors";
import type { AuthBinding } from "../profile/schema";

export type SecretResolver = (secretRef: string) => string | undefined;

export type AuthHeaderResult = {
  headers: Record<string, string>;
};

/**
 * Resolve per-API auth headers. OAuth token exchange is stubbed for M1 activation
 * checks that require the binding shape; live token fetch is performed when a
 * token URL is reachable and secrets resolve.
 */
export async function resolveAuthHeaders(
  binding: AuthBinding,
  resolveSecret: SecretResolver,
  fetchImpl: typeof fetch = fetch,
): Promise<AuthHeaderResult> {
  switch (binding.type) {
    case "none":
      return { headers: {} };
    case "bearer": {
      const token = resolveSecret(binding.tokenSecretRef);
      if (!token) {
        throw new TmfError(
          "ACTIVATION_DENIED",
          `Missing bearer secret ${binding.tokenSecretRef}`,
        );
      }
      return { headers: { Authorization: `Bearer ${token}` } };
    }
    case "oauth2-client-credentials": {
      const clientId = resolveSecret(binding.clientIdSecretRef);
      const clientSecret = resolveSecret(binding.clientSecretRef);
      if (!clientId || !clientSecret) {
        throw new TmfError(
          "ACTIVATION_DENIED",
          "OAuth client credentials secrets are not resolved",
        );
      }
      const body = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      });
      if (binding.scopes.length > 0) {
        body.set("scope", binding.scopes.join(" "));
      }
      let response: Response;
      try {
        response = await fetchImpl(binding.tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
          body,
          redirect: "error",
        });
      } catch (cause) {
        throw new TmfError("UPSTREAM_AUTH_FAILURE", "OAuth token request failed", {
          retryable: true,
          cause,
        });
      }
      if (!response.ok) {
        throw new TmfError("UPSTREAM_AUTH_FAILURE", `OAuth token HTTP ${response.status}`);
      }
      const json = (await response.json()) as { access_token?: unknown };
      if (typeof json.access_token !== "string" || !json.access_token) {
        throw new TmfError("UPSTREAM_AUTH_FAILURE", "OAuth response missing access_token");
      }
      return { headers: { Authorization: `Bearer ${json.access_token}` } };
    }
    default: {
      const _exhaustive: never = binding;
      throw new TmfError("PROFILE_INVALID", `Unsupported auth binding ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function envSecretResolver(
  env: Record<string, string | undefined> = process.env,
): SecretResolver {
  return (secretRef) => env[secretRef];
}
