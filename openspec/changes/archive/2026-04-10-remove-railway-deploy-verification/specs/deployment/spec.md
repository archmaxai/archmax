## REMOVED Requirements

### Requirement: Railway Post-Deploy Health Smoke Test

**Reason**: The Railway deployment verification workflow is no longer needed and is being removed to simplify the CI pipeline.
**Migration**: Delete `.github/workflows/deploy.yml`. No other workflows or application code depend on this workflow.

#### Scenario: Workflow no longer exists

- **WHEN** a deployment event occurs
- **THEN** no Railway health smoke test workflow runs
