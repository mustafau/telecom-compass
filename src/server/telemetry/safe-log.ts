import "../guard";

/** Structured logs without customer identifiers or secret material. */
export function safeLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, string | number | boolean | undefined> = {},
): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitize(fields),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function sanitize(
  fields: Record<string, string | number | boolean | undefined>,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (
      lower.includes("customer") ||
      lower.includes("token") ||
      lower.includes("secret") ||
      lower.includes("password") ||
      lower.includes("authorization")
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}
