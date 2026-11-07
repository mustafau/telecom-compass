import "../../guard";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { TmfError } from "../errors";
import { sha256Hex } from "../hash";

const lockEntrySchema = z.object({
  contractRef: z.string().min(1),
  apiId: z.string().regex(/^TMF\d+$/),
  major: z.enum(["v4", "v5"]),
  edition: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  /** Path relative to repository root or absolute; fixture contracts are original stubs. */
  file: z.string().min(1),
  source: z.enum([
    "fixture-original",
    "setup-fetched",
    "setup-placeholder",
    "approved-external",
  ]),
  notes: z.string().optional(),
});

export const contractLockSchema = z.object({
  schemaVersion: z.literal(1),
  contracts: z.array(lockEntrySchema).min(1),
});

export type ContractLock = z.infer<typeof contractLockSchema>;
export type ContractLockEntry = z.infer<typeof lockEntrySchema>;

export async function loadContractLock(filePath: string): Promise<ContractLock> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const result = contractLockSchema.safeParse(parsed);
  if (!result.success) {
    throw new TmfError(
      "PROFILE_INVALID",
      `Invalid contract lock ${filePath}: ${result.error.message}`,
    );
  }
  return result.data;
}

export function findLockEntry(
  lock: ContractLock,
  contractRef: string,
): ContractLockEntry | undefined {
  return lock.contracts.find((entry) => entry.contractRef === contractRef);
}

export async function verifyContractHash(
  entry: ContractLockEntry,
  repoRoot: string,
): Promise<void> {
  const absolute = path.isAbsolute(entry.file)
    ? entry.file
    : path.resolve(repoRoot, entry.file);
  let bytes: Buffer;
  try {
    bytes = await readFile(absolute);
  } catch (cause) {
    throw new TmfError(
      "CONTRACT_MISMATCH",
      `Contract file missing for ${entry.contractRef}: ${absolute}`,
      { cause },
    );
  }
  const digest = sha256Hex(bytes);
  if (digest !== entry.sha256) {
    throw new TmfError(
      "CONTRACT_MISMATCH",
      `Contract hash mismatch for ${entry.contractRef}: expected ${entry.sha256}, got ${digest}`,
    );
  }
}

export async function verifyAllReferencedContracts(options: {
  lock: ContractLock;
  contractRefs: Iterable<string>;
  repoRoot: string;
}): Promise<void> {
  const seen = new Set<string>();
  for (const ref of options.contractRefs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const entry = findLockEntry(options.lock, ref);
    if (!entry) {
      throw new TmfError(
        "CONTRACT_MISMATCH",
        `Contract ref ${ref} is not present in the contract lock`,
      );
    }
    await verifyContractHash(entry, options.repoRoot);
  }
}
