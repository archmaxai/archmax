# ---------- base ----------
FROM node:25-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Node 25 dropped bundled corepack, so install pnpm directly.
RUN npm install -g pnpm@10.30.3

# ---------- deps ----------
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/e2e/package.json ./apps/e2e/
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/worker/package.json ./apps/worker/
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile

# ---------- test ----------
FROM deps AS test

COPY apps/ ./apps/
COPY packages/ ./packages/
COPY vitest.config.ts ./

RUN pnpm test:coverage

# ---------- build-api ----------
FROM deps AS build-api

COPY apps/api/ ./apps/api/
COPY packages/core/ ./packages/core/

COPY scripts/bundle.mjs ./scripts/
RUN mkdir -p apps/frontend/src apps/worker/src \
 && pnpm --filter @archmax/core build \
 && pnpm --filter @archmax/api exec tsc --declaration false --composite false --declarationMap false \
 && node scripts/bundle.mjs apps/api/dist/index.js apps/api/server.mjs \
      apps/api/package.json packages/core/package.json

# ---------- build-worker ----------
FROM deps AS build-worker

COPY apps/api/ ./apps/api/
COPY apps/worker/ ./apps/worker/
COPY packages/core/ ./packages/core/

COPY scripts/bundle.mjs ./scripts/
RUN mkdir -p apps/frontend/src \
 && pnpm --filter @archmax/core build \
 && pnpm --filter @archmax/worker exec tsc --declaration false --composite false --declarationMap false \
 && node scripts/bundle.mjs apps/worker/dist/index.js apps/worker/worker.mjs \
      apps/worker/package.json apps/api/package.json packages/core/package.json

# ---------- build-spa ----------
FROM deps AS build-spa

COPY apps/api/ ./apps/api/
COPY apps/frontend/ ./apps/frontend/
COPY packages/core/ ./packages/core/
COPY packages/ui/ ./packages/ui/

RUN pnpm --filter @archmax/frontend exec vite build

# ---------- production ----------
FROM base AS production
ARG APP_VERSION=dev
WORKDIR /app
ENV NODE_ENV=production
ENV APP_VERSION=$APP_VERSION

RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx redis-server gosu gnupg curl ca-certificates \
 && curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg \
 && echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] http://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/8.0 multiverse" \
      > /etc/apt/sources.list.d/mongodb-org-8.0.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends mongodb-org-server mongodb-mongosh \
 && apt-get purge -y --auto-remove gnupg \
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

RUN useradd -r -M -d /data -s /bin/false archmax \
 && mkdir -p /data /tmp/redis \
 && chown -R archmax:archmax /data /tmp/redis /var/log

# Pre-install DuckDB extensions so INSTALL is not needed at runtime (avoids
# filesystem/network issues inside locked-down containers).
RUN node -e " \
  const { DuckDBInstance } = require('@duckdb/node-api'); \
  (async () => { \
    const inst = await DuckDBInstance.create(); \
    const db = await inst.connect(); \
    await db.run('INSTALL postgres'); \
    await db.run('INSTALL mysql'); \
    await db.run('INSTALL sqlite'); \
    await db.run('INSTALL mssql FROM community'); \
    await db.run('INSTALL iceberg'); \
    await db.run('INSTALL httpfs'); \
    await db.run('INSTALL avro'); \
    db.disconnectSync(); \
  })();" \
 && mkdir -p /duckdb-extensions \
 && cp -r /root/.duckdb/extensions/* /duckdb-extensions/ \
 && chown -R archmax:archmax /duckdb-extensions
ENV HOME=/data ARCHMAX_DATA_DIR=/data

COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default \
 && sed -i 's|pid /run/nginx.pid;|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
 && sed -i 's/^user /#user /' /etc/nginx/nginx.conf \
 && mkdir -p /var/cache/nginx /var/log/nginx /var/lib/nginx \
 && chown -R archmax:archmax /var/cache/nginx /var/log/nginx /var/lib/nginx /etc/nginx \
 && touch /tmp/nginx.pid && chown archmax:archmax /tmp/nginx.pid

COPY --chmod=755 entrypoint.sh /entrypoint.sh

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
