import "../../guard";
import { canonicalJson, sha256Hex } from "../hash";
import type { DeploymentProfile } from "./schema";

export type CheckedProfile = DeploymentProfile & {
  readonly revision: string;
};

export function computeProfileRevision(profile: DeploymentProfile): string {
  return sha256Hex(canonicalJson(profile));
}

export function withRevision(profile: DeploymentProfile): CheckedProfile {
  return Object.freeze({
    ...profile,
    revision: computeProfileRevision(profile),
  }) as CheckedProfile;
}
