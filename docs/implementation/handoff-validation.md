# Documentation integrity check

Historical note: this check was first run when the design package was assembled (2026-11-01). It remains useful as a lightweight docs/config sanity gate.

It verifies:

- Required entry documents exist
- Relative Markdown links resolve and fenced code blocks are balanced
- JSON files parse; answer-schema references resolve
- Evaluation IDs are unique and cases include expected/forbidden outcomes
- Example YAML parses; relationship plans refer to declared operations; example TMF operations are GET-only
- Forge examples identify Compass as their writable repository

It does **not** replace application tests (`pnpm test`, integration, e2e, Cloudflare gates).

```sh
python3 scripts/validate-handoff.py
```
