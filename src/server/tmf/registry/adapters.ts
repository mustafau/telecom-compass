import "../../guard";
import { TmfError } from "../errors";
import type { VersionAdapter } from "../adapters/types";
import { tmf629V4Adapter, tmf629V5Adapter } from "../adapters/tmf629";
import { tmf637V4Adapter, tmf637V5Adapter } from "../adapters/tmf637";
import { tmf638V5Adapter } from "../adapters/tmf638";
import { tmf639V4Adapter, tmf639V5Adapter } from "../adapters/tmf639";
import { tmf621V4Adapter, tmf621V5Adapter } from "../adapters/tmf621";
import { tmf641V4Adapter, tmf641V5Adapter } from "../adapters/tmf641";

const adapters: Record<string, VersionAdapter> = {
  "tmf629-v4": tmf629V4Adapter,
  "tmf629-v5": tmf629V5Adapter,
  "tmf637-v4": tmf637V4Adapter,
  "tmf637-v5": tmf637V5Adapter,
  "tmf638-v5": tmf638V5Adapter,
  "tmf639-v4": tmf639V4Adapter,
  "tmf639-v5": tmf639V5Adapter,
  "tmf621-v4": tmf621V4Adapter,
  "tmf621-v5": tmf621V5Adapter,
  "tmf641-v4": tmf641V4Adapter,
  "tmf641-v5": tmf641V5Adapter,
};

export function listRegisteredAdapters(): readonly string[] {
  return Object.keys(adapters).sort();
}

export function getAdapter(adapterId: string): VersionAdapter {
  const adapter = adapters[adapterId];
  if (!adapter) {
    throw new TmfError("ACTIVATION_DENIED", `Unknown adapter id: ${adapterId}`);
  }
  return adapter;
}

export function hasAdapter(adapterId: string): boolean {
  return adapterId in adapters;
}
