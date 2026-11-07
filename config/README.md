# Deployment configuration

`deployments.example.yaml` illustrates the required profile structure. URLs, query names, contract references and claim mappings in the example are illustrative — not claims about every TMF implementation.

Validated profiles load from YAML (`pnpm profile:check`). Contract SHA-256 digests live in a lock file (`contracts.lock.json` / `contracts.lock.local.json`). Placeholder or mismatched hashes fail activation. Do not invent hashes or editions just to make activation pass.

Independent test profiles and original fixture contract stubs: [fixtures/](fixtures/).

A profile contains no secret values. `secretRef` resolves an administrator-specified environment/secret-manager key and may never be chosen through chat. Local fixture profiles may use `type: none`; live profiles must explicitly configure and validate their auth binding.

Supported authentication mechanisms initially: bearer token from a secret reference, and OAuth2 client credentials. Local fixtures may use none. Delegated user tokens, token exchange, and mTLS need an explicit adapter and tests before enabling.

Knowledge is optional. A disabled knowledge source leaves API questions operational. A live profile cannot reference a fixture corpus. Production API paths and filtering syntax come from deployed contracts and verified probes.

## Default local backend

`pnpm setup:local` writes ignored `deployments.local.yaml` and `contracts.lock.local.json` for profile `telecom-api-sandbox`, using `LOCAL_TMF_BASE_URL` (default http://localhost:8787). It may fetch OpenAPI at setup time only. Filtered list/relationship queries stay disabled until verified — do not copy example filters into the sandbox profile. See [default backend](../docs/operations/default-backend.md). Automated tests select `config/fixtures/` profiles explicitly.
