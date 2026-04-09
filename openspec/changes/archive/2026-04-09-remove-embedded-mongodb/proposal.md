# Change: Remove embedded MongoDB from Docker image

## Why

The embedded MongoDB adds ~275 MB to the Docker image and introduces operational risks (no replica set, no transactions, no process supervision for `mongod`). Since the `docker-compose.yml` already ships a proper MongoDB service, embedding it in the image provides marginal convenience at disproportionate cost. Removing it simplifies the image, reduces the attack surface, and steers users toward a proper MongoDB setup from the start.

## What Changes

- **Dockerfile**: Remove MongoDB 7.x installation (GPG key import, external apt repo, `mongodb-org-server`, `mongodb-mongosh`, cleanup of `gnupg`/`curl`). Keep `redis-server` embedded.
- **Entrypoint**: Remove the embedded `mongod` startup block. Keep the embedded Redis block unchanged.
- **`MONGODB_URI` becomes required again**: Revert the Zod schema to require `MONGODB_URI`. The Docker image no longer provides a fallback.
- **`/app/data/mongodb` removed**: The data directory layout simplifies to just `/app/data/projects/`.
- **`docker-compose.yml` becomes the primary deployment method**: Update comments and documentation to position Compose as the recommended quick start.
- **`.env.example`**: Mark `MONGODB_URI` as required.
- **Documentation**: Update installation, configuration reference, self-hosting guide, and Docker reference to reflect that MongoDB is always external.

## Impact

- Affected specs: `deployment` (modifies 4 of 6 requirements from `add-single-image-deployment`)
- Affected code: `Dockerfile`, `entrypoint.sh`, `packages/core/src/config/env.ts`, `packages/core/src/infra/db.ts`, `.env.example`, `docker-compose.yml`, `apps/docs/`
- **BREAKING**: Users currently running `docker run` without `MONGODB_URI` will need to either switch to `docker compose up` or provide an external MongoDB connection string.
