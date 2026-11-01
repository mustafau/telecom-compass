import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("client import boundary", () => {
  it("does not import server modules from client entrypoints", () => {
    const files = ["src/client/main.tsx", "src/client/App.tsx"];
    for (const file of files) {
      const source = readFileSync(path.resolve(file), "utf8");
      expect(source).not.toMatch(/from\s+["']@server/);
      expect(source).not.toMatch(/from\s+["']\.\.\/server/);
      expect(source).not.toMatch(/MODEL_API_KEY/);
    }
  });
});
