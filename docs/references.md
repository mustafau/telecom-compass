# Sources and references

## Project decisions

- Project name: Telecom Compass
- Data agent: Vercel AI SDK with UI and direct TMF client access
- No MCP in the current release
- Optional maintenance via [telecom-forge](https://github.com/mustafau/telecom-forge); Forge does not need production data
- Target configurable TMF implementations — not a sandbox-specific application. Telecom API Sandbox is only the default **configured** local-development backend
- License: MIT (see repository root `LICENSE`)

## Related repositories

- [telecom-forge](https://github.com/mustafau/telecom-forge): engineering automation that can maintain this repository (catalog/build profiles, draft PR workflow). Not a runtime dependency.
- [telecom-api-sandbox](https://github.com/mustafau/telecom-api-sandbox): deterministic TMF contract mock used as the default local backend profile. Its scenarios, endpoints, and fixed dates are profile data, not Compass application assumptions.

## Official technical references

- [AI SDK introduction](https://ai-sdk.dev/docs/introduction)
- [AI SDK native tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK agents](https://ai-sdk.dev/docs/agents/building-agents)
- [AI SDK UI](https://ai-sdk.dev/docs/ai-sdk-ui/overview)
- [Hono](https://hono.dev/)
- [AI SDK Hono cookbook](https://ai-sdk.dev/cookbook/api-servers/hono)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [TM Forum Open APIs](https://www.tmforum.org/open-digital-architecture/open-apis)

Use documentation matching the pinned versions in `package.json` / `docs/implementation/status.md`.
