#!/usr/bin/env tsx
import path from "node:path";
import { checkProfile } from "../src/server/tmf/profile/check";

function usage(): never {
  console.error(`Usage: pnpm profile:check --profile <id> [--deployments <file>] [--lock <file>] [--live]

Offline by default. --live records that live probes require an authorized probe set (not run here).`);
  process.exit(2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let profileId = "";
  let deploymentsFile = path.resolve("config/fixtures/deployments.yaml");
  let lockFile = path.resolve("config/fixtures/contracts.lock.json");
  let live = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--profile") {
      profileId = args[++i] ?? "";
    } else if (arg === "--deployments") {
      deploymentsFile = path.resolve(args[++i] ?? "");
    } else if (arg === "--lock") {
      lockFile = path.resolve(args[++i] ?? "");
    } else if (arg === "--live") {
      live = true;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    } else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }

  if (!profileId) usage();

  const report = await checkProfile({
    deploymentsFile,
    profileId,
    contractLockFile: lockFile,
    repoRoot: process.cwd(),
    offline: !live,
  });

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
