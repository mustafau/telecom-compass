import "../../guard";
import path from "node:path";
import { loadContractLock, verifyAllReferencedContracts } from "../contracts/lock";
import { TmfError } from "../errors";
import { buildOperationRegistry } from "../registry/operations";
import { hasAdapter } from "../registry/adapters";
import { envSecretResolver, type SecretResolver } from "../transport/auth";
import { assertSafeBaseUrl } from "../transport/url";
import { deriveEffectiveCapabilities } from "./capabilities";
import { getProfile, loadDeploymentsFile } from "./load";
import { withRevision, type CheckedProfile } from "./revision";
import type { DeploymentProfile, RelationshipPlan } from "./schema";

export type ProfileCheckReport = {
  profileId: string;
  revision: string;
  ok: boolean;
  environment: "fixture" | "live";
  capabilities: ReturnType<typeof deriveEffectiveCapabilities>["effective"];
  disabledCapabilities: ReturnType<typeof deriveEffectiveCapabilities>["disabled"];
  operations: string[];
  adapters: string[];
  errors: string[];
  warnings: string[];
};

export type ProfileCheckOptions = {
  deploymentsFile: string;
  profileId: string;
  contractLockFile: string;
  repoRoot?: string;
  /** Offline mode never calls the network (default true). */
  offline?: boolean;
  resolveSecret?: SecretResolver;
};

export async function checkProfile(options: ProfileCheckOptions): Promise<ProfileCheckReport> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const repoRoot = options.repoRoot ?? process.cwd();
  const resolveSecret = options.resolveSecret ?? envSecretResolver();

  let profile: DeploymentProfile | undefined;
  let checked: CheckedProfile | undefined;

  try {
    const file = await loadDeploymentsFile(options.deploymentsFile);
    profile = getProfile(file, options.profileId);
    checked = withRevision(profile);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return emptyFail(options.profileId, errors, warnings);
  }

  try {
    const lock = await loadContractLock(options.contractLockFile);
    const refs = Object.values(profile.apis).map((api) => api.contractRef);
    await verifyAllReferencedContracts({ lock, contractRefs: refs, repoRoot });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  let operations: string[] = [];
  const adapters = new Set<string>();
  try {
    const registry = buildOperationRegistry(profile);
    operations = [...registry.keys()].sort();
    for (const entry of registry.values()) {
      adapters.add(entry.api.adapter);
      assertSafeBaseUrl(entry.api.baseUrl);
      if (!hasAdapter(entry.api.adapter)) {
        errors.push(`Unknown adapter ${entry.api.adapter}`);
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  try {
    validateRelationshipPlans(profile);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (profile.environment === "live") {
    for (const [name, binding] of Object.entries(profile.authentication)) {
      if (binding.type === "none") {
        errors.push(`Live profile cannot use auth binding ${name} with type none`);
        continue;
      }
      if (binding.type === "bearer" && !resolveSecret(binding.tokenSecretRef)) {
        errors.push(`Unresolved bearer secret ${binding.tokenSecretRef} for ${name}`);
      }
      if (binding.type === "oauth2-client-credentials") {
        if (!resolveSecret(binding.clientIdSecretRef) || !resolveSecret(binding.clientSecretRef)) {
          errors.push(`Unresolved OAuth secrets for auth binding ${name}`);
        }
      }
    }
    if (profile.knowledge.type !== "disabled") {
      // live may use knowledge, but not a fixture corpus path convention
    }
  }

  if (options.offline === false) {
    warnings.push("Live probe mode is not executed by checkProfile; use an authorized probe runner");
  }

  const { effective, disabled } = deriveEffectiveCapabilities(profile);
  warnings.push(...disabled.map((d) => `${d.capability}: ${d.reason}`));

  return {
    profileId: profile.id,
    revision: checked.revision,
    ok: errors.length === 0,
    environment: profile.environment,
    capabilities: effective,
    disabledCapabilities: disabled,
    operations,
    adapters: [...adapters].sort(),
    errors,
    warnings,
  };
}

function validateRelationshipPlans(profile: DeploymentProfile): void {
  const registry = buildOperationRegistry(profile);
  for (const [name, plan] of Object.entries(profile.relationships)) {
    validatePlan(name, plan, profile, registry);
  }
}

function validatePlan(
  name: string,
  plan: RelationshipPlan,
  profile: DeploymentProfile,
  registry: ReturnType<typeof buildOperationRegistry>,
  stack: string[] = [],
): void {
  if (stack.includes(name)) {
    throw new TmfError("PROFILE_INVALID", `Relationship plan cycle involving ${name}`);
  }
  const nextStack = [...stack, name];
  if (nextStack.length > profile.limits.maxRelationshipDepth) {
    throw new TmfError("PROFILE_INVALID", `Relationship plan ${name} exceeds max depth`);
  }
  switch (plan.type) {
    case "reference":
      if (!registry.has(plan.targetOperation)) {
        throw new TmfError(
          "PROFILE_INVALID",
          `Plan ${name} targetOperation ${plan.targetOperation} is not registered`,
        );
      }
      break;
    case "query":
      if (!registry.has(plan.operation)) {
        throw new TmfError(
          "PROFILE_INVALID",
          `Plan ${name} operation ${plan.operation} is not registered`,
        );
      }
      break;
    case "via":
      for (const step of plan.steps) {
        const nested = profile.relationships[step];
        if (!nested) {
          throw new TmfError("PROFILE_INVALID", `Plan ${name} references missing step ${step}`);
        }
        validatePlan(step, nested, profile, registry, nextStack);
      }
      break;
    default: {
      const _exhaustive: never = plan;
      throw new TmfError("PROFILE_INVALID", `Unknown plan type ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function emptyFail(
  profileId: string,
  errors: string[],
  warnings: string[],
): ProfileCheckReport {
  return {
    profileId,
    revision: "",
    ok: false,
    environment: "fixture",
    capabilities: {
      customerRead: false,
      productRead: false,
      serviceRead: false,
      resourceRead: false,
      ticketRead: false,
      serviceOrderRead: false,
      customerToServices: false,
      serviceToTickets: false,
      serviceToOrders: false,
      knowledgeSearch: false,
    },
    disabledCapabilities: [],
    operations: [],
    adapters: [],
    errors,
    warnings,
  };
}

export function resolveRepoPath(...parts: string[]): string {
  return path.resolve(...parts);
}
