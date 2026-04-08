# ---------- base ----------
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# ---------- deps ----------
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/worker/package.json ./apps/worker/
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile

# ---------- test ----------
FROM deps AS test

COPY apps/ ./apps/
COPY packages/ ./packages/
COPY vitest.workspace.ts vitest.config.ts ./

RUN pnpm test:coverage

# ---------- build-api ----------
FROM deps AS build-api

COPY apps/api/ ./apps/api/
COPY packages/core/ ./packages/core/

RUN mkdir -p apps/frontend/src apps/worker/src && pnpm --filter @archsem/api build && pnpm --filter @archsem/core build \
 && EXTERNALS=$(node -e " \
      var a=require('./apps/api/package.json'), c=require('./packages/core/package.json'); \
      var deps=[...new Set([...Object.keys(a.dependencies),...Object.keys(c.dependencies)])] \
        .filter(function(d){return !d.startsWith('@archsem/')}); \
      console.log(deps.map(function(d){return '--external:'+d}).join(' '))") \
 && npx esbuild apps/api/dist/index.js \
      --bundle --platform=node --format=esm \
      --outfile=apps/api/server.mjs $EXTERNALS

# ---------- build-worker ----------
FROM deps AS build-worker

COPY apps/api/ ./apps/api/
COPY apps/worker/ ./apps/worker/
COPY packages/core/ ./packages/core/

RUN mkdir -p apps/frontend/src && pnpm --filter @archsem/worker build && pnpm --filter @archsem/api build && pnpm --filter @archsem/core build \
 && EXTERNALS=$(node -e " \
      var w=require('./apps/worker/package.json'), o=require('./apps/api/package.json'), c=require('./packages/core/package.json'); \
      var deps=[...new Set([...Object.keys(w.dependencies),...Object.keys(o.dependencies),...Object.keys(c.dependencies)])] \
        .filter(function(d){return !d.startsWith('@archsem/')}); \
      console.log(deps.map(function(d){return '--external:'+d}).join(' '))") \
 && npx esbuild apps/worker/dist/index.js \
      --bundle --platform=node --format=esm \
      --outfile=apps/worker/worker.mjs $EXTERNALS

# ---------- build-spa ----------
FROM deps AS build-spa

COPY apps/api/ ./apps/api/
COPY apps/frontend/ ./apps/frontend/
COPY packages/core/ ./packages/core/
COPY packages/ui/ ./packages/ui/

RUN pnpm --filter @archsem/frontend... build

# ---------- production ----------
FROM base AS production
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx redis-server gnupg curl \
 && curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
      | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" \
      > /etc/apt/sources.list.d/mongodb-org-7.0.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends mongodb-org-server mongodb-mongosh \
 && apt-get purge -y --auto-remove gnupg curl \
 && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/worker/package.json ./apps/worker/
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile --prod --shamefully-hoist

COPY --from=build-api /app/apps/api/server.mjs ./apps/api/server.mjs
COPY --from=build-api /app/packages/core/prompts ./prompts
ENV PROMPTS_DIR=/app/prompts
COPY --from=build-worker /app/apps/worker/worker.mjs ./apps/worker/worker.mjs
COPY --from=build-spa /app/apps/frontend/dist /usr/share/nginx/html

RUN mkdir -p /app/data/projects /app/data/mongodb /tmp/redis

COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
