# Change: Remove Railway Post-Deploy Health Smoke Test

## Why

The Railway deployment verification workflow is no longer needed. Removing it simplifies the CI pipeline and eliminates a workflow that depends on external deployment events.

## What Changes

- Delete the `.github/workflows/deploy.yml` GitHub Actions workflow
- Remove the "Railway Post-Deploy Health Smoke Test" requirement from the deployment spec

## Impact

- Affected specs: `deployment`
- Affected code: `.github/workflows/deploy.yml`
