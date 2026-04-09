## 1. Dockerfile — remove MongoDB packages

- [x] 1.1 Remove the MongoDB GPG key import, external apt repo setup, and `mongodb-org-server`/`mongodb-mongosh` installation from the production stage
- [x] 1.2 Remove `gnupg` and `curl` from the `apt-get install` line (no longer needed for MongoDB repo setup)
- [x] 1.3 Remove `mkdir -p /app/data/mongodb` from the image layer
- [ ] 1.4 Verify the image builds successfully and is ~250 MB smaller

## 2. Entrypoint — remove embedded MongoDB startup

- [x] 2.1 Remove the entire `if [ -z "$MONGODB_URI" ]` block that starts embedded `mongod` and waits for readiness
- [x] 2.2 Keep the embedded Redis block (`if [ -z "$REDIS_URL" ]`) unchanged
- [x] 2.3 Remove `mkdir -p /app/data/mongodb` from the entrypoint (keep `/app/data/projects` creation)

## 3. Env schema — make MONGODB_URI required

- [x] 3.1 Revert `MONGODB_URI` to `z.string()` (required) in `packages/core/src/config/env.ts`
- [x] 3.2 Clean up any optional-handling fallback in `packages/core/src/infra/db.ts` that was added for the embedded mode

## 4. docker-compose.yml — update as primary method

- [x] 4.1 Update the header comment in `docker-compose.yml` to position it as the recommended deployment method
- [ ] 4.2 Verify `docker compose up -d` works with the updated image (no embedded MongoDB, external mongo service provides it)

## 5. .env.example — update MONGODB_URI

- [x] 5.1 Change `MONGODB_URI` from optional/commented-out to required with a placeholder value

## 6. Documentation updates

- [x] 6.1 Update `apps/docs/src/content/docs/getting-started/installation.mdx`: lead with `docker compose up` as primary quick start; move `docker run` to a secondary section requiring `MONGODB_URI`
- [x] 6.2 Update `apps/docs/src/content/docs/reference/configuration.mdx`: mark `MONGODB_URI` as required; remove embedded-fallback notes; update data directory section to remove `mongodb/`
- [x] 6.3 Update `apps/docs/src/content/docs/guides/self-hosting.mdx`: remove embedded MongoDB guidance; update backup instructions to cover MongoDB separately from the app volume
- [x] 6.4 Update `apps/docs/src/content/docs/reference/docker.mdx`: remove MongoDB from image contents; update entrypoint behavior; update volume documentation; update environment variable table; update troubleshooting section

## 7. Validation

- [ ] 7.1 Build the Docker image and verify it starts with `MONGODB_URI` and without `REDIS_URL` (embedded Redis still works)
- [ ] 7.2 Verify the image fails with a clear error when `MONGODB_URI` is not provided
- [ ] 7.3 Verify the Compose stack starts and archmax connects to the Compose `mongo` and `redis` services
- [ ] 7.4 Verify local dev workflow is unaffected (still uses `.env` with `MONGODB_URI`)
