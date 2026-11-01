import { useState } from "react";

type StreamEvent = {
  type: string;
  id?: string;
  data?: unknown;
};

export function App() {
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runProofStream() {
    setBusy(true);
    setError(null);
    setEvents([]);
    try {
      const response = await fetch("/api/proof/stream", { method: "POST" });
      if (!response.ok) {
        throw new Error(`Proof stream failed (${response.status})`);
      }
      if (!response.body) {
        throw new Error("Proof stream returned no body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n");
        buffer = chunks.pop() ?? "";
        for (const line of chunks) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as StreamEvent;
            setEvents((prev) => [...prev, parsed]);
          } catch {
            // Ignore non-JSON keepalives from the stream transport.
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown stream error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Telecom Compass</h1>
      <p>
        M0 foundation: Hono Worker + React UI. Run the no-key proof stream to exercise native tools,
        structured output, and UI data parts.
      </p>
      <button type="button" onClick={() => void runProofStream()} disabled={busy}>
        {busy ? "Running proof…" : "Run proof stream"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      <pre aria-live="polite">{JSON.stringify(events, null, 2)}</pre>
    </main>
  );
}
