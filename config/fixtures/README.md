# Independent TMF fixture profiles

Original Compass fixtures for deterministic tests. They are **not** Telecom API Sandbox and must not be used as a silent fallback when the default local backend is down.

| Profile | Purpose |
| --- | --- |
| `fixture-a` | Mixed-major paths under `/a/…`, v4-style relatedParty / relatedEntity |
| `fixture-b` | Alternate `/b/tmf/…` paths, v5 nested refs, different query names |
| `fixture-c` | Missing ticket operations; claimed `ticketRead` is forced off |
| `fixture-d` | Missing relationship plans; claimed `customerToServices` is forced off |

Contract stubs under `contracts/` document fields Compass consumes. They are original fixture documents, not TM Forum OpenAPI redistributions. Hashes live in `contracts.lock.json`.

Run offline checks:

```sh
pnpm profile:check --profile fixture-a
pnpm profile:check --profile fixture-b
```
