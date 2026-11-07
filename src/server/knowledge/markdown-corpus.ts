import "../guard";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ExecutionContext } from "../domain/execution";
import type { EvidenceLedger } from "../evidence/ledger";
import type { ToolResult } from "../domain/services/catalog";

export type KnowledgeHit = {
  documentId: string;
  title: string;
  excerpt: string;
  score: number;
};

type DocMeta = {
  id: string;
  title: string;
  tenantId: string;
  deploymentIds: string[];
  audience: Array<"operator" | "customer">;
  customerIds: string[];
  body: string;
};

/**
 * Optional ACL-filtered Markdown corpus. Disabled when knowledge.type=disabled.
 */
export function createMarkdownKnowledgeSource(rootDir: string) {
  let cache: DocMeta[] | null = null;

  async function load(): Promise<DocMeta[]> {
    if (cache) return cache;
    const files = await readdir(rootDir);
    const docs: DocMeta[] = [];
    for (const file of files.filter((f) => f.endsWith(".md"))) {
      const raw = await readFile(path.join(rootDir, file), "utf8");
      docs.push(parseDoc(raw, file));
    }
    cache = docs;
    return docs;
  }

  return {
    async search(
      ctx: ExecutionContext,
      ledger: EvidenceLedger,
      query: string,
      limit = 3,
    ): Promise<ToolResult<{ hits: KnowledgeHit[] }>> {
      ctx.budget.reserveTool();
      const docs = await load();
      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
      const hits: KnowledgeHit[] = [];
      for (const doc of docs) {
        if (doc.tenantId !== ctx.principal.tenantId) continue;
        if (!doc.deploymentIds.includes(ctx.deploymentId)) continue;
        if (!doc.audience.includes(ctx.principal.audience)) continue;
        if (
          ctx.targetCustomerId &&
          doc.customerIds.length > 0 &&
          !doc.customerIds.includes(ctx.targetCustomerId)
        ) {
          continue;
        }
        const hay = `${doc.title}\n${doc.body}`.toLowerCase();
        const score = tokens.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
        if (score <= 0) continue;
        hits.push({
          documentId: doc.id,
          title: doc.title,
          excerpt: doc.body.slice(0, 400),
          score,
        });
      }
      hits.sort((a, b) => b.score - a.score);
      const selected = hits.slice(0, Math.min(5, Math.max(1, limit)));
      const evidenceIds: string[] = [];
      for (const hit of selected) {
        const ev = await ledger.record({
          kind: "document",
          fields: { title: hit.title, excerpt: hit.excerpt, score: hit.score },
          visibility: ctx.principal.audience,
          sourceLocator: `doc:${hit.documentId}`,
          provenance: { documentId: hit.documentId },
        });
        evidenceIds.push(ev.id);
      }
      return {
        status: "ok",
        data: { hits: selected },
        evidenceIds,
        completeness: "unknown",
        warnings: [],
      };
    },
  };
}

function parseDoc(raw: string, fileName: string): DocMeta {
  if (!raw.startsWith("---")) {
    return {
      id: fileName,
      title: fileName,
      tenantId: "tenant-a",
      deploymentIds: ["fixture-a"],
      audience: ["operator"],
      customerIds: [],
      body: raw,
    };
  }
  const end = raw.indexOf("---", 3);
  const front = raw.slice(3, end).trim();
  const body = raw.slice(end + 3).trim();
  const meta: Record<string, string> = {};
  for (const line of front.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return {
    id: meta.id ?? fileName,
    title: meta.title ?? fileName,
    tenantId: meta.tenantId ?? "tenant-a",
    deploymentIds: (meta.deploymentIds ?? "fixture-a").split(",").map((s) => s.trim()),
    audience: (meta.audience ?? "operator")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is "operator" | "customer" => s === "operator" || s === "customer"),
    customerIds: (meta.customerIds ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    body,
  };
}
