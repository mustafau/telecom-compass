import "../../guard";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Principal } from "../types";

const entitlementsSchema = z.object({
  schemaVersion: z.literal(1),
  policyVersion: z.string().min(1),
  principals: z.array(
    z.object({
      email: z.string().email(),
      displayName: z.string().min(1).optional(),
      tenantId: z.string().min(1),
      audience: z.enum(["operator", "customer"]),
      roles: z.array(z.string()).default([]),
      allowedDeploymentIds: z.array(z.string()).min(1),
      allowedCustomerIds: z.array(z.string()).min(1),
    }),
  ),
});

export type OidcEntitlementsFile = z.infer<typeof entitlementsSchema>;

export async function loadOidcEntitlements(path: string): Promise<OidcEntitlementsFile> {
  const raw = await readFile(path, "utf8");
  const parsed = entitlementsSchema.safeParse(parseYaml(raw));
  if (!parsed.success) {
    throw new Error(`Invalid OIDC entitlements file: ${parsed.error.message}`);
  }
  return parsed.data;
}

/**
 * Map IdP identity to a Compass principal using an explicit email allowlist.
 * Cloudflare Access typically supplies `email` (and `sub`); custom tenant claims are not required.
 */
export function principalFromOidcEntitlements(
  claims: Record<string, unknown>,
  file: OidcEntitlementsFile,
): Principal {
  const issuer = typeof claims.iss === "string" ? claims.iss : "";
  const subject = typeof claims.sub === "string" ? claims.sub : "";
  if (!issuer || !subject) throw new Error("OIDC claims missing iss/sub");

  const emailRaw =
    (typeof claims.email === "string" && claims.email) ||
    (typeof claims.preferred_username === "string" && claims.preferred_username) ||
    "";
  const email = emailRaw.trim().toLowerCase();
  if (!email) throw new Error("OIDC claims missing email");

  const entry = file.principals.find((p) => p.email.toLowerCase() === email);
  if (!entry) {
    throw Object.assign(new Error("Email is not entitled for Compass"), {
      code: "NOT_ENTITLED",
    });
  }

  return {
    subject,
    issuer,
    tenantId: entry.tenantId,
    audience: entry.audience,
    roles: [...entry.roles],
    policyVersion: file.policyVersion,
    displayName: entry.displayName ?? (typeof claims.name === "string" ? claims.name : email),
    allowedDeploymentIds: [...entry.allowedDeploymentIds],
    allowedCustomerIds: [...entry.allowedCustomerIds],
  };
}
