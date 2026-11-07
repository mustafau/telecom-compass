import "../../guard";
import { TmfError } from "../errors";
import type { OperationDef } from "../profile/schema";

const PATH_PARAM = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

export type BindingValues = Readonly<Record<string, string | number | boolean | undefined>>;

export function assertSafeBaseUrl(baseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch (cause) {
    throw new TmfError("PROFILE_INVALID", `Invalid API baseUrl: ${baseUrl}`, { cause });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TmfError("PROFILE_INVALID", `Unsupported baseUrl protocol: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new TmfError("PROFILE_INVALID", "Credentials in baseUrl are forbidden");
  }
  return url;
}

export function buildOperationUrl(
  baseUrl: string,
  operation: OperationDef,
  pathArgs: BindingValues,
  queryValues: BindingValues,
): URL {
  const base = assertSafeBaseUrl(baseUrl);
  const path = fillPathTemplate(operation.path, pathArgs);
  const url = new URL(path.replace(/^\//, ""), ensureTrailingSlash(base));

  for (const param of operation.query) {
    const value = queryValues[param.source];
    if (value === undefined || value === null || value === "") {
      throw new TmfError(
        "INVALID_ARGUMENT",
        `Missing query binding ${param.source} for ${param.name}`,
      );
    }
    if (param.type === "string" && typeof value !== "string") {
      throw new TmfError("INVALID_ARGUMENT", `Query ${param.name} must be string`);
    }
    if (param.type === "integer" && typeof value !== "number") {
      throw new TmfError("INVALID_ARGUMENT", `Query ${param.name} must be integer`);
    }
    if (param.type === "boolean" && typeof value !== "boolean") {
      throw new TmfError("INVALID_ARGUMENT", `Query ${param.name} must be boolean`);
    }
    url.searchParams.set(param.name, String(value));
  }

  return url;
}

export function fillPathTemplate(template: string, args: BindingValues): string {
  const required = new Set<string>();
  for (const match of template.matchAll(PATH_PARAM)) {
    required.add(match[1]!);
  }
  for (const key of required) {
    const value = args[key] ?? args[`args.${key}`];
    if (value === undefined || value === null || value === "") {
      throw new TmfError("INVALID_ARGUMENT", `Missing path parameter {${key}}`);
    }
    if (typeof value === "string" && /[/\\?]/.test(value)) {
      throw new TmfError("INVALID_ARGUMENT", `Path parameter {${key}} contains forbidden characters`);
    }
  }
  return template.replace(PATH_PARAM, (_, name: string) => {
    const value = args[name] ?? args[`args.${name}`];
    return encodeURIComponent(String(value));
  });
}

export function sameOrigin(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && a.host === b.host;
}

function ensureTrailingSlash(url: URL): URL {
  const copy = new URL(url.href);
  if (!copy.pathname.endsWith("/")) {
    copy.pathname = `${copy.pathname}/`;
  }
  return copy;
}
