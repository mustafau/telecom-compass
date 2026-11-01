import "../guard";
import { tool } from "ai";
import { z } from "zod";

export type ProofToolResult = {
  fact: string;
  evidenceId: string;
};

/** Native AI SDK tool used only for the M0 compilation/runtime proof. */
export function createProofTools() {
  return {
    lookupStatus: tool({
      description: "Look up a synthetic service status for the SDK proof.",
      inputSchema: z.object({
        serviceId: z.string().min(1),
      }),
      execute: async ({ serviceId }): Promise<ProofToolResult> => ({
        fact: `Service ${serviceId} operationalState=enabled`,
        evidenceId: `ev-proof-${serviceId}`,
      }),
    }),
  };
}
