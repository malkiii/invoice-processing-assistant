# syntax=docker/dockerfile:1

# ---- base: Node + pnpm ----
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

# ---- deps: install all dependencies (cached on the lockfile) ----
FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

# ---- dev: used by docker-compose.dev.yml with the source bind-mounted ----
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm dev --host 0.0.0.0"]

# ---- build: Nuxt app + standalone worker and migrator bundles ----
FROM deps AS build
COPY . .
RUN pnpm build

# ---- runtime: only the self-contained .output ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
# Migrations run on every app start; the worker container overrides this command.
CMD ["sh", "-c", "node .output/migrate/index.mjs && exec node .output/server/index.mjs"]
