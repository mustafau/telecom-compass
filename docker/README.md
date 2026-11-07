# Container hosting (Node)

This image runs the **Node** adapter of the Hono app. Cloudflare Workers use Wrangler, not this Dockerfile.

```sh
docker compose up -d postgres
pnpm setup:local
DATABASE_URL=postgresql://compass:local_only@127.0.0.1:5432/compass pnpm db:migrate
docker build -f docker/Dockerfile -t telecom-compass:local .
docker run --rm -p 3000:3000 --env-file .env.local telecom-compass:local
```

Do not bake secrets into the image. Production must set `APP_MODE=production`, `AUTH_MODE=oidc`, `MODEL_MODE=provider`, and a real `DATABASE_URL`.
