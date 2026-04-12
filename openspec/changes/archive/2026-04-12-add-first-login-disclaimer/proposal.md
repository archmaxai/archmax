# Change: Add first-login disclaimer dialog

## Why

Users need to understand the operational implications before using the system. Semantic model building uses long-running AI agents that can consume significant LLM tokens and put load on connected source databases. Additionally, schema metadata (table names, column names, sample/distinct values) is sent to the configured LLM provider. A one-time disclaimer after first login ensures users acknowledge these risks.

## What Changes

- After the first successful login, a modal dialog is shown that requires the user to check an acknowledgment checkbox before proceeding
- The disclaimer covers: token cost from long-running agents, load on source databases during exploration, schema metadata (potentially including PII) sent to LLM providers, and the fact that AI-generated models should be reviewed
- Acceptance is persisted in `localStorage` so the disclaimer only appears once per browser
- If `localStorage` is cleared, the disclaimer re-appears (acceptable for a single-user system)

## Impact

- Affected specs: `auth`
- Affected code: `apps/frontend/src/routes/login.tsx`, `apps/frontend/src/routes/_auth.tsx`, new disclaimer dialog component
