import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkProfile } from "../../../src/server/tmf/profile/check";

const deploymentsFile = path.resolve("config/fixtures/deployments.yaml");
const lockFile = path.resolve("config/fixtures/contracts.lock.json");

describe("profile:check offline", () => {
  it("passes for fixture-a and fixture-b", async () => {
    for (const profileId of ["fixture-a", "fixture-b"]) {
      const report = await checkProfile({
        deploymentsFile,
        profileId,
        contractLockFile: lockFile,
        repoRoot: process.cwd(),
        offline: true,
      });
      expect(report.ok, report.errors.join("; ")).toBe(true);
      expect(report.operations).toContain("customer.get");
      expect(report.adapters.length).toBeGreaterThan(0);
    }
  });

  it("reports degraded capabilities for fixture-c without failing schema", async () => {
    const report = await checkProfile({
      deploymentsFile,
      profileId: "fixture-c",
      contractLockFile: lockFile,
      repoRoot: process.cwd(),
      offline: true,
    });
    expect(report.ok).toBe(true);
    expect(report.capabilities.ticketRead).toBe(false);
    expect(report.disabledCapabilities.some((d) => d.capability === "ticketRead")).toBe(true);
  });
});
