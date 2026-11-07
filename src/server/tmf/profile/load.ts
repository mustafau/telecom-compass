import "../../guard";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { TmfError } from "../errors";
import { deploymentsFileSchema, type DeploymentProfile, type DeploymentsFile } from "./schema";
import { withRevision, type CheckedProfile } from "./revision";

export function parseDeploymentsYaml(raw: string): DeploymentsFile {
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (cause) {
    throw new TmfError("PROFILE_INVALID", "Deployments YAML could not be parsed", { cause });
  }
  const result = deploymentsFileSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new TmfError("PROFILE_INVALID", `Deployments YAML invalid: ${details}`);
  }
  assertUniqueIds(result.data.deployments);
  return result.data;
}

export async function loadDeploymentsFile(filePath: string): Promise<DeploymentsFile> {
  const raw = await readFile(filePath, "utf8");
  return parseDeploymentsYaml(raw);
}

export function getProfile(file: DeploymentsFile, id: string): DeploymentProfile {
  const profile = file.deployments.find((entry) => entry.id === id);
  if (!profile) {
    throw new TmfError("PROFILE_INVALID", `Deployment profile not found: ${id}`);
  }
  return profile;
}

export async function loadCheckedProfile(
  filePath: string,
  profileId: string,
): Promise<CheckedProfile> {
  const file = await loadDeploymentsFile(filePath);
  return withRevision(getProfile(file, profileId));
}

function assertUniqueIds(profiles: DeploymentProfile[]): void {
  const seen = new Set<string>();
  for (const profile of profiles) {
    if (seen.has(profile.id)) {
      throw new TmfError("PROFILE_INVALID", `Duplicate deployment id: ${profile.id}`);
    }
    seen.add(profile.id);
  }
}
