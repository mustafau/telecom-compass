import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkProfile } from "../../../src/server/tmf/profile/check";
import { deriveEffectiveCapabilities } from "../../../src/server/tmf/profile/capabilities";
import { getProfile, loadDeploymentsFile, parseDeploymentsYaml } from "../../../src/server/tmf/profile/load";
import { withRevision } from "../../../src/server/tmf/profile/revision";

const fixturesDir = path.resolve("config/fixtures");
const deploymentsFile = path.join(fixturesDir, "deployments.yaml");
const lockFile = path.join(fixturesDir, "contracts.lock.json");

describe("deployment profiles", () => {
  it("loads fixture A/B and computes stable revisions", async () => {
    const file = await loadDeploymentsFile(deploymentsFile);
    const a = withRevision(getProfile(file, "fixture-a"));
    const b = withRevision(getProfile(file, "fixture-b"));
    expect(a.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(b.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(a.revision).not.toEqual(b.revision);
  });

  it("fails activation when a contract hash is wrong", async () => {
    const report = await checkProfile({
      deploymentsFile,
      profileId: "fixture-a",
      contractLockFile: lockFile,
      repoRoot: process.cwd(),
    });
    expect(report.ok).toBe(true);

    const brokenLock = path.resolve("config/fixtures/contracts.lock.broken.json");
    const { readFile, writeFile, unlink } = await import("node:fs/promises");
    const lock = JSON.parse(await readFile(lockFile, "utf8")) as {
      schemaVersion: number;
      contracts: Array<{ sha256: string; contractRef: string }>;
    };
    lock.contracts = lock.contracts.map((entry) =>
      entry.contractRef === "fixture-tmf629-v4-compass"
        ? { ...entry, sha256: "0".repeat(64) }
        : entry,
    );
    await writeFile(brokenLock, `${JSON.stringify(lock)}\n`);
    try {
      const bad = await checkProfile({
        deploymentsFile,
        profileId: "fixture-a",
        contractLockFile: brokenLock,
        repoRoot: process.cwd(),
      });
      expect(bad.ok).toBe(false);
      expect(bad.errors.some((e) => e.includes("hash mismatch"))).toBe(true);
    } finally {
      await unlink(brokenLock);
    }
  });

  it("disables claimed capabilities when operations are missing (fixture-c)", async () => {
    const file = await loadDeploymentsFile(deploymentsFile);
    const profile = getProfile(file, "fixture-c");
    const { effective, disabled } = deriveEffectiveCapabilities(profile);
    expect(profile.capabilities.ticketRead).toBe(true);
    expect(effective.ticketRead).toBe(false);
    expect(disabled.some((d) => d.capability === "ticketRead")).toBe(true);
  });

  it("disables customerToServices when relationship plan is absent (fixture-d)", async () => {
    const file = await loadDeploymentsFile(deploymentsFile);
    const profile = getProfile(file, "fixture-d");
    const { effective } = deriveEffectiveCapabilities(profile);
    expect(profile.capabilities.customerToServices).toBe(true);
    expect(effective.customerToServices).toBe(false);
  });

  it("rejects non-GET methods in profile schema", () => {
    expect(() =>
      parseDeploymentsYaml(`
schemaVersion: 1
deployments:
  - id: bad
    label: bad
    environment: fixture
    tenantBindings: [t]
    authentication:
      fixture:
        type: none
    apis:
      customer:
        apiId: TMF629
        major: v4
        contractRef: x
        adapter: tmf629-v4
        baseUrl: http://127.0.0.1:9/a
        auth: fixture
        operations:
          customer.create:
            method: POST
            path: /customer
            responseKind: customer
    capabilities: {}
    relationships: {}
    extensions: []
    knowledge:
      type: disabled
    limits:
      maxRelatedRecordsPerKind: 5
      maxRelationshipDepth: 3
      maxResponseBytes: 1048576
`),
    ).toThrow(/invalid|Invalid|Deployments YAML/i);
  });
});
