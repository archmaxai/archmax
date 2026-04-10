## 1. Dockerfile — install MongoDB

- [x] 1.1 Add MongoDB 8.x apt repository setup (GPG key, sources list) and install `mongodb-org-server` and `mongodb-mongosh` in the production stage
- [x] 1.2 Clean up apt caches and temporary GPG/curl packages after install
- [x] 1.3 Add `mkdir -p /app/data/mongodb` alongside the existing `/app/data/projects` directory creation

## 2. Entrypoint — conditional mongod startup

- [x] 2.1 Remove the current hard-fail block that exits when `MONGODB_URI` is unset
- [x] 2.2 Add an `if [ -z "$MONGODB_URI" ]` block that starts `mongod --bind_ip 127.0.0.1 --dbpath /app/data/mongodb --logpath /var/log/mongod.log --fork`
- [x] 2.3 Add a readiness loop that polls `mongosh --eval 'db.runCommand({ping:1})' --quiet` (max ~10 seconds, fail with clear error if timeout)
- [x] 2.4 Export `MONGODB_URI=mongodb://127.0.0.1:27017/archmax` after readiness confirmed

## 3. Env schema — make MONGODB_URI optional

- [x] 3.1 Change `MONGODB_URI: z.string()` to `MONGODB_URI: z.string().optional()` in `packages/core/src/config/env.ts`
- [x] 3.2 Verify `connectDB()` in `packages/core/src/infra/db.ts` throws a clear error if `MONGODB_URI` is undefined at connection time

## 4. Documentation

- [x] 4.1 Update `apps/docs/src/content/docs/getting-started/installation.mdx`: re-add `docker run` as a viable quick-start (no external MongoDB needed), keep Compose as recommended for production
- [x] 4.2 Update `apps/docs/src/content/docs/reference/configuration.mdx`: mark `MONGODB_URI` as optional with note about embedded fallback; update data directory section to include `mongodb/`
- [x] 4.3 Update `apps/docs/src/content/docs/reference/docker.mdx`: document embedded MongoDB behavior, update volume section to include `/app/data/mongodb`, update entrypoint decision tree
- [x] 4.4 Update `apps/docs/src/content/docs/guides/self-hosting.mdx`: document that embedded MongoDB is available for simple deployments, recommend Compose for production

## 5. Verification

- [ ] 5.1 Build the Docker image and verify it starts without `MONGODB_URI` (embedded MongoDB + embedded Redis)
- [ ] 5.2 Verify external `MONGODB_URI` overrides embedded MongoDB (embedded mongod does not start)
- [ ] 5.3 Verify `/app/data/mongodb` is created and receives data files
- [ ] 5.4 Verify single volume mount to `/app/data` captures both projects and mongodb data
- [ ] 5.5 Verify `docker compose up` still works (both external services used, no embedded processes started)
