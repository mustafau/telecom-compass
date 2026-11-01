# Deployment configuration

`deployments.example.yaml` illustrates the required profile structure. Copy it to an ignored local file (`deployments.local.yaml`) when implementing or configuring the loader. URLs, query names, contract references and claim mappings in the example are illustrative — not claims about every TMF implementation.

M1 implements strict schema validation, generates `contracts.lock.json` from verified exact source editions/hashes, and builds independent fixture profiles. Placeholder contract references intentionally prevent live activation. Do not invent hashes or editions just to make activation pass.

A profile contains no secret values. `secretRef` resolves an administrator-specified environment/secret-manager key and may never be chosen through chat. The local fixture profile may use `type: none`; live profiles must explicitly configure and validate their auth binding.

Supported authentication mechanisms initially: bearer token from a secret reference, and OAuth2 client credentials with token caching until expiry minus skew. Local fixtures may use none. Delegated user tokens, token exchange, and mTLS need an explicit adapter and tests before enabling.

Knowledge is optional. A disabled knowledge source leaves API questions operational. A live profile cannot reference a fixture corpus. Production API paths and filtering syntax come from deployed contracts and verified probes.

## Default local backend

Local setup generates/selects the ordinary profile `telecom-api-sandbox`, using `LOCAL_TMF_BASE_URL` (default http://localhost:8787). `deployments.example.yaml` remains a generic format illustration, not the sandbox profile: do not copy its filtered queries into the sandbox profile without verification. See [default backend](../docs/operations/default-backend.md). Tests select separate fixture profiles explicitly.
