# Node hosting of the same Hono app. Not a Cloudflare Worker image.
FROM node:22.12.0-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM node:22.12.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@10.18.3 --activate
COPY --from=build /app /app
EXPOSE 3000
CMD ["pnpm", "dev:node"]
