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
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile

# ---------- build-api ----------
FROM deps AS build-api

COPY apps/api/ ./apps/api/
COPY packages/core/ ./packages/core/

RUN mkdir -p apps/frontend/src && pnpm --filter @semlayer/api build && pnpm --filter @semlayer/core build \
 && EXTERNALS=$(node -e " \
      var a=require('./apps/api/package.json'), c=require('./packages/core/package.json'); \
      var deps=[...new Set([...Object.keys(a.dependencies),...Object.keys(c.dependencies)])] \
        .filter(function(d){return !d.startsWith('@semlayer/')}); \
      console.log(deps.map(function(d){return '--external:'+d}).join(' '))") \
 && npx esbuild apps/api/dist/index.js \
      --bundle --platform=node --format=esm \
      --outfile=apps/api/server.mjs $EXTERNALS

# ---------- build-spa ----------
FROM deps AS build-spa

COPY apps/api/ ./apps/api/
COPY apps/frontend/ ./apps/frontend/
COPY packages/core/ ./packages/core/
COPY packages/ui/ ./packages/ui/

RUN pnpm --filter @semlayer/frontend... build

# ---------- production ----------
FROM base AS production
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends nginx \
 && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile --prod --shamefully-hoist

COPY --from=build-api /app/apps/api/server.mjs ./apps/api/server.mjs
COPY --from=build-spa /app/apps/frontend/dist /usr/share/nginx/html

COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
