import "../../guard";
import { TmfError } from "../errors";
import { sameOrigin } from "./url";

export const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;

export type BoundGetOptions = {
  url: URL;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  /** When set, redirects must stay on this origin; otherwise redirects are denied. */
  allowedOrigin?: URL;
};

export type BoundGetResult = {
  status: number;
  headers: Headers;
  bodyText: string;
  url: string;
};

export async function boundedGet(options: BoundGetOptions): Promise<BoundGetResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const controller = new AbortController();
  const timeout = options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : undefined;

  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);

  try {
    let response: Response;
    try {
      response = await fetchImpl(options.url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...options.headers,
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        throw new TmfError("UPSTREAM_TIMEOUT", "TMF GET timed out or cancelled", {
          retryable: true,
          cause,
        });
      }
      throw new TmfError("UPSTREAM_UNAVAILABLE", "TMF GET failed", { retryable: true, cause });
    }

    if (isRedirect(response.status)) {
      const location = response.headers.get("location");
      if (!location || !options.allowedOrigin) {
        throw new TmfError("REDIRECT_DENIED", "TMF redirects are not followed without policy");
      }
      const next = new URL(location, options.url);
      if (!sameOrigin(next, options.allowedOrigin)) {
        throw new TmfError("REDIRECT_DENIED", "Cross-origin TMF redirect denied");
      }
      return boundedGet({ ...options, url: next });
    }

    const bodyText = await readBodyLimited(response, maxBytes);
    return {
      status: response.status,
      headers: response.headers,
      bodyText,
      url: options.url.href,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readBodyLimited(response: Response, maxBytes: number): Promise<string> {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader) {
    const length = Number(lengthHeader);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new TmfError("RESPONSE_TOO_LARGE", `TMF response Content-Length ${length} exceeds limit`);
    }
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore cancel errors
      }
      throw new TmfError("RESPONSE_TOO_LARGE", `TMF response exceeded ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

export function assertGetOnly(method: string): void {
  if (method.toUpperCase() !== "GET") {
    throw new TmfError("METHOD_NOT_ALLOWED", `Only GET is permitted; got ${method}`);
  }
}
