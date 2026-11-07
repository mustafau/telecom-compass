import "../guard";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Principal } from "./types";

const personasFileSchema = z.object({
  schemaVersion: z.literal(1),
  policyVersion: z.string(),
  personas: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      subject: z.string(),
      tenantId: z.string(),
      audience: z.enum(["operator", "customer"]),
      roles: z.array(z.string()),
      allowedDeploymentIds: z.array(z.string()),
      allowedCustomerIds: z.array(z.string()),
    }),
  ),
});

export type LocalPersonaFile = z.infer<typeof personasFileSchema>;

export async function loadLocalPersonas(filePath: string): Promise<LocalPersonaFile> {
  const raw = await readFile(filePath, "utf8");
  const parsed = personasFileSchema.safeParse(parseYaml(raw));
  if (!parsed.success) {
    throw new Error(`Invalid local personas file: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function personaToPrincipal(
  file: LocalPersonaFile,
  personaId: string,
): Principal {
  const persona = file.personas.find((p) => p.id === personaId);
  if (!persona) {
    throw new Error(`Unknown persona: ${personaId}`);
  }
  return {
    subject: persona.subject,
    tenantId: persona.tenantId,
    audience: persona.audience,
    roles: persona.roles,
    policyVersion: file.policyVersion,
    issuer: "local-fixture",
    displayName: persona.displayName,
    allowedDeploymentIds: persona.allowedDeploymentIds,
    allowedCustomerIds: persona.allowedCustomerIds,
  };
}
