## 1. Remove em-dashes from README.md and all docs

- [x] 1.1 Replace all 21 em-dash occurrences in `README.md` with appropriate alternatives (commas, colons, parentheses, hyphens for table cells)
- [x] 1.2 Replace all ~68 em-dash occurrences across 12 `.mdx` files in `apps/docs/src/content/docs/`
- [x] 1.3 Replace em-dashes in `.env.example` comments (line 1: `Required —`)
- [x] 1.4 Verify zero em-dashes remain: `rg '—' README.md apps/docs/src/content/docs/ .env.example`

## 2. Fix quickstart guide

- [x] 2.1 Remove "click **New Model**" from `quickstart.mdx` and replace with the actual chat-based workflow: navigate to Semantic Models, start a conversation, describe the model you want
- [x] 2.2 Add brief descriptions of each UI section (Dashboard/Projects, Semantic Models, Data Federation, Data Browser, MCP Access, Testing) so users understand the product layout
- [x] 2.3 Clarify the "Publish" step to explain what publishing does (assembles source YAML into optimized build files for MCP)

## 3. Improve installation page

- [x] 3.1 Add `UI_USERNAME` to both Docker Compose and standalone Docker examples in `installation.mdx`
- [x] 3.2 Add a prominent "Save your secret" warning after the `BETTER_AUTH_SECRET` generation step, explaining consequences of losing it
- [x] 3.3 Add a "Log in" step after deployment telling users to open the URL and authenticate with `UI_USERNAME` / `UI_PASSWORD`
- [x] 3.4 Add a brief comparison box or note explaining when to use standalone vs. Docker Compose

## 4. Update README Quick Start

- [x] 4.1 Add `UI_USERNAME=admin` to the `docker run` example
- [x] 4.2 Add a note after the command to save `BETTER_AUTH_SECRET`
- [x] 4.3 Update the "Open and log in" line to reference both `UI_USERNAME` and `UI_PASSWORD`
- [x] 4.4 Remove `MONGODB_URI` from the primary Docker example (standalone mode does not need it)
- [x] 4.5 Verify the README docker command matches the installation docs exactly

## 5. Expand configuration reference

- [x] 5.1 Ensure `UI_USERNAME` is listed in the Admin Credentials table in `configuration.mdx` (it already is, verify)
- [x] 5.2 Verify `AGENT_MODEL` default is consistent between `configuration.mdx` and `docker.mdx` (currently mismatched: `claude-sonnet-4.6` vs. `claude-sonnet-4`)

## 6. Add solution overview to docs landing page

- [x] 6.1 Add a "How It Works" or "Product Overview" section to `index.mdx` or `quickstart.mdx` describing the UI sections and workflow from a user's perspective
- [x] 6.2 Clarify that the model builder is a chat-based AI agent, not a form wizard

## 7. Fix .env.example

- [x] 7.1 Change `MONGODB_URI` comment from `# Required` to `# Optional` and note that Docker embeds MongoDB when unset
- [x] 7.2 Uncomment `UI_USERNAME` line (remove the `#`) or add a clear comment that it defaults to `admin`

## 8. Update self-hosting and Docker reference

- [x] 8.1 Add trade-off descriptions to the deployment modes section in `self-hosting.mdx` (when to use standalone vs. Compose, pros/cons)
- [x] 8.2 Add `BETTER_AUTH_SECRET` persistence warning to `docker.mdx` required variables table
- [x] 8.3 Verify `docker.mdx` env var tables include `UI_USERNAME` (they do, verify wording)

## 9. Final consistency check

- [x] 9.1 Cross-reference README.md against `installation.mdx` and `configuration.mdx` for parameter parity
- [x] 9.2 Run docs build (`pnpm --filter @archmax/docs build`) to verify no broken links or build errors
