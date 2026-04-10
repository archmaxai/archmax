## 1. Backend: Expose agent configuration status

- [x] 1.1 Extend `/api/config` endpoint in `apps/api/src/app.ts` to include `agentConfigured: boolean` (true when `AGENT_API_KEY` is non-empty)

## 2. Environment file updates

- [x] 2.1 Rewrite the AI Agent section in `.env.example` to clearly state `AGENT_API_KEY` is required for agent features, list supported providers, and describe the other `AGENT_*` vars
- [x] 2.2 Add a comment to the `AGENT_API_KEY` line in `docker-compose.yml` noting it is required for agent features

## 3. Frontend: Agent config missing banner

- [x] 3.1 Add a query for `/api/config` in the `AgentChat` component (or a shared hook) that provides `agentConfigured` status
- [x] 3.2 Show a warning banner in the `AgentChat` empty state when `agentConfigured` is `false`, listing the required env vars and where to set them
- [x] 3.3 Disable the chat input (`disableSend`) when agent is not configured
- [x] 3.4 Verify the banner appears on both the Semantic Model Builder (`/models/chat/new`) and Testing Playground pages

## 4. Documentation updates

- [x] 4.1 Update the AI Agent section in `apps/docs/src/content/docs/reference/configuration.mdx` with a note that `AGENT_API_KEY` is required for agent features, plus supported provider list
- [x] 4.2 Update `README.md` Quick Start to mention `AGENT_API_KEY` and its importance
- [x] 4.3 Ensure no em-dashes are introduced in any edited files

## 5. Verification

- [x] 5.1 Run `pnpm typecheck` and `pnpm lint` to confirm no build errors
- [ ] 5.2 Manually verify: start without `AGENT_API_KEY` and confirm the banner appears on both chat pages
- [ ] 5.3 Manually verify: start with `AGENT_API_KEY` set and confirm the default empty state shows normally
