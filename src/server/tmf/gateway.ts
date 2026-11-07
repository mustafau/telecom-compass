import "../guard";
import type { SourceMeta } from "../domain/types";
import type { NormalizedEntity } from "./adapters/types";
import { TmfError } from "./errors";
import type { CheckedProfile } from "./profile/revision";
import { getAdapter } from "./registry/adapters";
import {
  buildOperationRegistry,
  getRegisteredOperation,
  type RegisteredOperation,
} from "./registry/operations";
import { resolveAuthHeaders, type SecretResolver } from "./transport/auth";
import { boundedGet } from "./transport/http";
import { buildOperationUrl, type BindingValues } from "./transport/url";

export type GatewayContext = {
  deploymentId: string;
  profileRevision: string;
  targetCustomerId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  quality: "fixture" | "live";
  now?: () => Date;
};

export type TmfGateway = {
  read(
    operationKey: string,
    args: BindingValues,
  ): Promise<{ data: NormalizedEntity | NormalizedEntity[]; source: SourceMeta; rawStatus: number }>;
};

export type CreateGatewayOptions = {
  profile: CheckedProfile;
  resolveSecret: SecretResolver;
  fetchImpl?: typeof fetch;
};

export function createTmfGateway(options: CreateGatewayOptions): TmfGateway {
  const registry = buildOperationRegistry(options.profile);

  return {
    async read(operationKey, args) {
      const registered = getRegisteredOperation(registry, operationKey);
      return executeRead({
        registered,
        profile: options.profile,
        args,
        resolveSecret: options.resolveSecret,
        fetchImpl: options.fetchImpl,
        context: {
          deploymentId: options.profile.id,
          profileRevision: options.profile.revision,
          targetCustomerId:
            typeof args["context.targetCustomerId"] === "string"
              ? args["context.targetCustomerId"]
              : undefined,
          quality: options.profile.environment,
        },
      });
    },
  };
}

async function executeRead(input: {
  registered: RegisteredOperation;
  profile: CheckedProfile;
  args: BindingValues;
  resolveSecret: SecretResolver;
  fetchImpl?: typeof fetch;
  context: GatewayContext;
}): Promise<{ data: NormalizedEntity | NormalizedEntity[]; source: SourceMeta; rawStatus: number }> {
  const { registered, profile, args } = input;
  const authBinding = profile.authentication[registered.api.auth];
  if (!authBinding) {
    throw new TmfError("ACTIVATION_DENIED", `Auth binding missing for ${registered.api.auth}`);
  }

  const bindings: Record<string, string | number | boolean | undefined> = {
    ...args,
  };
  if (input.context.targetCustomerId) {
    bindings["context.targetCustomerId"] = input.context.targetCustomerId;
  }

  const url = buildOperationUrl(
    registered.api.baseUrl,
    registered.operation,
    bindings,
    bindings,
  );

  const auth = await resolveAuthHeaders(
    authBinding,
    input.resolveSecret,
    input.fetchImpl ?? fetch,
  );

  const response = await boundedGet({
    url,
    headers: auth.headers,
    signal: input.context.signal,
    timeoutMs: input.context.timeoutMs ?? 8_000,
    maxBytes: profile.limits.maxResponseBytes,
    fetchImpl: input.fetchImpl,
    allowedOrigin: new URL(registered.api.baseUrl),
  });

  if (response.status === 401 || response.status === 403) {
    throw new TmfError("UPSTREAM_AUTH_FAILURE", `TMF auth failure HTTP ${response.status}`);
  }
  if (response.status === 404) {
    throw new TmfError("NOT_FOUND_OR_NOT_AUTHORIZED", `Resource not found for ${registered.operationKey}`);
  }
  if (response.status === 429) {
    throw new TmfError("UPSTREAM_RATE_LIMITED", "TMF rate limited", { retryable: true });
  }
  if (response.status >= 500) {
    throw new TmfError("UPSTREAM_UNAVAILABLE", `TMF upstream HTTP ${response.status}`, {
      retryable: true,
    });
  }
  if (response.status >= 400) {
    throw new TmfError(
      "INVALID_UPSTREAM_RESPONSE",
      `TMF client error HTTP ${response.status} for ${registered.operationKey}`,
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(response.bodyText) as unknown;
  } catch (cause) {
    throw new TmfError("INVALID_UPSTREAM_RESPONSE", "TMF response was not JSON", { cause });
  }

  const retrievedAt = (input.context.now ?? (() => new Date))().toISOString();
  const source: SourceMeta = {
    deploymentId: input.context.deploymentId,
    profileRevision: input.context.profileRevision,
    contractRef: registered.api.contractRef,
    operationKey: registered.operationKey,
    retrievedAt,
    quality: input.context.quality,
  };

  const adapter = getAdapter(registered.api.adapter);
  const data = adapter.normalize(json, {
    source,
    apiId: registered.api.apiId as `TMF${number}`,
    major: registered.api.major,
    responseKind: registered.operation.responseKind,
  });

  return { data, source, rawStatus: response.status };
}
