import "../../guard";
import { TmfError } from "../errors";
import type { ApiEntry, DeploymentProfile, OperationDef } from "../profile/schema";
import type { CheckedProfile } from "../profile/revision";
import { assertGetOnly } from "../transport/http";
import { assertSafeBaseUrl } from "../transport/url";
import { hasAdapter } from "./adapters";

export type RegisteredOperation = {
  operationKey: string;
  apiKey: string;
  api: ApiEntry;
  operation: OperationDef;
};

export function buildOperationRegistry(
  profile: DeploymentProfile | CheckedProfile,
): Map<string, RegisteredOperation> {
  const registry = new Map<string, RegisteredOperation>();
  for (const [apiKey, api] of Object.entries(profile.apis)) {
    assertSafeBaseUrl(api.baseUrl);
    if (!hasAdapter(api.adapter)) {
      throw new TmfError(
        "ACTIVATION_DENIED",
        `API ${apiKey} references unknown adapter ${api.adapter}`,
      );
    }
    if (!profile.authentication[api.auth]) {
      throw new TmfError(
        "ACTIVATION_DENIED",
        `API ${apiKey} references unknown auth binding ${api.auth}`,
      );
    }
    for (const [operationKey, operation] of Object.entries(api.operations)) {
      assertGetOnly(operation.method);
      if (registry.has(operationKey)) {
        throw new TmfError(
          "PROFILE_INVALID",
          `Duplicate operation key ${operationKey} across APIs`,
        );
      }
      registry.set(operationKey, {
        operationKey,
        apiKey,
        api,
        operation,
      });
    }
  }
  return registry;
}

export function getRegisteredOperation(
  registry: Map<string, RegisteredOperation>,
  operationKey: string,
): RegisteredOperation {
  const entry = registry.get(operationKey);
  if (!entry) {
    throw new TmfError("CAPABILITY_UNAVAILABLE", `Operation not registered: ${operationKey}`);
  }
  return entry;
}
