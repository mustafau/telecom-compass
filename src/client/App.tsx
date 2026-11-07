import { useEffect, useState } from "react";

type Persona = { id: string; displayName: string; audience: string; tenantId: string };
type Session = {
  subject: string;
  displayName: string;
  audience: "operator" | "customer";
  tenantId: string;
  allowedDeploymentIds: string[];
  allowedCustomerIds: string[];
};
type Conversation = {
  id: string;
  revision: number;
  scope: { deploymentId: string; targetCustomerId: string };
};
type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "progress"; label: string }
  | { kind: "answer"; payload: unknown }
  | { kind: "error"; message: string };

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

export function App() {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [deploymentId, setDeploymentId] = useState("fixture-a");
  const [customerId, setCustomerId] = useState("cust-100");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [capabilities, setCapabilities] = useState<Record<string, boolean> | null>(null);
  const [input, setInput] = useState("Why is svc-100 unavailable?");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [evidence, setEvidence] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const sessionRes = await fetch("/api/session");
      if (sessionRes.ok) {
        setSession((await sessionRes.json()) as Session);
      }
      const personaRes = await fetch("/api/auth/local/personas");
      if (personaRes.ok) {
        const body = (await personaRes.json()) as { personas: Persona[] };
        setPersonas(body.personas);
      }
    })();
  }, []);

  async function login(personaId: string) {
    setError(null);
    const res = await fetch("/api/auth/local/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ personaId }),
    });
    if (!res.ok) {
      setError(`Login failed (${res.status})`);
      return;
    }
    const sessionRes = await fetch("/api/session");
    setSession((await sessionRes.json()) as Session);
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { origin: ORIGIN },
    });
    setSession(null);
    setConversation(null);
    setItems([]);
  }

  async function startConversation() {
    setError(null);
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({
        deploymentId,
        targetCustomerId: session?.audience === "customer" ? undefined : customerId,
      }),
    });
    if (!res.ok) {
      setError(`Create conversation failed (${res.status})`);
      return;
    }
    const body = (await res.json()) as Conversation;
    setConversation(body);
    const caps = await fetch(`/api/deployments/${deploymentId}/capabilities`);
    if (caps.ok) {
      const payload = (await caps.json()) as { capabilities: Record<string, boolean> };
      setCapabilities(payload.capabilities);
    }
    setItems([]);
  }

  async function sendTurn() {
    if (!conversation || busy) return;
    setBusy(true);
    setError(null);
    setItems((prev) => [...prev, { kind: "user", text: input }]);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify({
          clientTurnId: crypto.randomUUID(),
          expectedRevision: conversation.revision,
          text: input,
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`Turn failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as { type?: string; data?: unknown };
            if (parsed.type === "data-progress") {
              const data = parsed.data as { label?: string };
              setItems((prev) => [...prev, { kind: "progress", label: data.label ?? "Working…" }]);
            }
            if (parsed.type === "data-answer") {
              setItems((prev) => [...prev, { kind: "answer", payload: parsed.data }]);
              const answer = parsed.data as {
                content?: { claims?: Array<{ evidenceIds?: string[] }> };
              };
              const firstId = answer.content?.claims?.find((c) => c.evidenceIds?.[0])?.evidenceIds?.[0];
              if (firstId) {
                const ev = await fetch(
                  `/api/conversations/${conversation.id}/evidence/${firstId}`,
                );
                if (ev.ok) setEvidence(await ev.json());
              }
            }
            if (parsed.type === "data-turn") {
              const data = parsed.data as { conversationRevision?: number; status?: string };
              if (typeof data.conversationRevision === "number") {
                setConversation((prev) =>
                  prev ? { ...prev, revision: data.conversationRevision! } : prev,
                );
              }
            }
            if (parsed.type === "data-turn-error") {
              const data = parsed.data as { message?: string };
              setItems((prev) => [
                ...prev,
                { kind: "error", message: data.message ?? "Turn error" },
              ]);
            }
          } catch {
            // ignore keepalives
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Turn failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="brand">Telecom Compass</p>
          <p className="subtitle">Evidence-backed assistant · fixture indicators stay on in local mode</p>
        </div>
        {session ? (
          <div className="session-box">
            <span>
              {session.displayName} · {session.audience} · {session.tenantId}
            </span>
            <button type="button" onClick={() => void logout()}>
              Log out
            </button>
          </div>
        ) : null}
      </header>

      {!session ? (
        <section className="panel">
          <h2>Local test login</h2>
          <p>Choose a fixture persona. Local login cannot activate live deployments.</p>
          <div className="persona-row">
            {personas.map((p) => (
              <button key={p.id} type="button" onClick={() => void login(p.id)}>
                {p.displayName}
                <small>
                  {p.audience} / {p.tenantId}
                </small>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <div className="layout">
          <aside className="panel">
            <h2>Scope</h2>
            <label>
              Deployment
              <select value={deploymentId} onChange={(e) => setDeploymentId(e.target.value)}>
                {session.allowedDeploymentIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </label>
            {session.audience === "operator" ? (
              <label>
                Customer
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  {session.allowedCustomerIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p>Customer account bound from verified mapping.</p>
            )}
            <button type="button" onClick={() => void startConversation()}>
              Start conversation
            </button>
            {capabilities ? (
              <ul className="caps">
                {Object.entries(capabilities).map(([key, value]) => (
                  <li key={key} data-on={value ? "1" : "0"}>
                    {key}: {value ? "on" : "off"}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="fixture-banner">Fixture / synthetic data mode</p>
          </aside>

          <main className="panel chat">
            <h2>Chat</h2>
            <div className="suggestions">
              <button type="button" onClick={() => setInput("Why is svc-100 unavailable?")}>
                Diagnose svc-100
              </button>
              <button type="button" onClick={() => setInput("What is the status of svc-100?")}>
                Service status
              </button>
              <button
                type="button"
                onClick={() => setInput("Which services belong to this customer?")}
              >
                Customer services
              </button>
            </div>
            <div className="transcript" aria-live="polite">
              {items.map((item, index) => (
                <div key={`${item.kind}-${index}`} className={`bubble ${item.kind}`}>
                  {item.kind === "user" ? item.text : null}
                  {item.kind === "progress" ? item.label : null}
                  {item.kind === "error" ? item.message : null}
                  {item.kind === "answer" ? (
                    <AnswerView
                      payload={item.payload}
                      onOpenEvidence={(id) => {
                        if (!conversation) return;
                        void fetch(`/api/conversations/${conversation.id}/evidence/${id}`)
                          .then((r) => r.json())
                          .then(setEvidence);
                      }}
                    />
                  ) : null}
                </div>
              ))}
            </div>
            <div className="composer">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={3}
                disabled={!conversation || busy}
              />
              <button type="button" disabled={!conversation || busy} onClick={() => void sendTurn()}>
                {busy ? "Running…" : "Send"}
              </button>
            </div>
          </main>

          <aside className="panel evidence">
            <h2>Evidence</h2>
            {evidence ? <pre>{JSON.stringify(evidence, null, 2)}</pre> : <p>No evidence selected.</p>}
          </aside>
        </div>
      )}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AnswerView({
  payload,
  onOpenEvidence,
}: {
  payload: unknown;
  onOpenEvidence: (id: string) => void;
}) {
  const answer = payload as {
    content?: {
      status?: string;
      claims?: Array<{ text: string; evidenceIds: string[] }>;
      cards?: Array<{ title: string; kind: string; fields: Array<{ label: string; value: unknown }> }>;
      gaps?: string[];
    };
  };
  const content = answer.content;
  if (!content) return <pre>{JSON.stringify(payload, null, 2)}</pre>;
  return (
    <div>
      <p>
        <strong>Status:</strong> {content.status}
      </p>
      <ul>
        {content.claims?.map((claim, i) => (
          <li key={i}>
            {claim.text}{" "}
            {claim.evidenceIds.map((id) => (
              <button key={id} type="button" className="linkish" onClick={() => onOpenEvidence(id)}>
                evidence
              </button>
            ))}
          </li>
        ))}
      </ul>
      {content.cards?.map((card, i) => (
        <div key={i} className="card">
          <h3>
            {card.kind}: {card.title}
          </h3>
          <dl>
            {card.fields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{String(field.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {content.gaps?.length ? (
        <p className="gaps">Gaps: {content.gaps.join("; ")}</p>
      ) : null}
    </div>
  );
}
