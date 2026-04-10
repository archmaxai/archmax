# Change: Improve documentation user-friendliness and consistency

## Why

The current documentation has several user-facing issues that make it harder for new users to get started and understand the product. The quickstart guide references UI elements that don't exist ("New Model" button), deployment modes aren't clearly distinguished, critical warnings about data persistence (`BETTER_AUTH_SECRET`) are missing, login credentials (`UI_USERNAME`) aren't explained, and em-dashes are used throughout the README and docs against the project's typographic convention. The README and docs site are also inconsistent in places (e.g., the README docker command still lists `MONGODB_URI` as if it's required, while the docs correctly say it's optional).

## What Changes

- **Quickstart rewrite**: Replace "click New Model" with the actual chat-based model builder workflow. Describe each sidebar section and what users can do in it.
- **Deployment mode clarity**: Clearly distinguish standalone (embedded MongoDB + Redis) vs. Docker Compose (external services) deployment modes with explicit guidance on when to use each.
- **Login credentials**: Document `UI_USERNAME` (default: `admin`) alongside `UI_PASSWORD` in the quickstart and README so users know how to log in.
- **BETTER_AUTH_SECRET warning**: Add a prominent warning that this secret must be saved persistently. Changing or losing it invalidates all sessions and authentication data.
- **Parameter descriptions**: Expand the configuration reference and Docker examples with clearer descriptions of what each parameter does and when it's needed.
- **Solution overview**: Add a section describing the UI's main areas (Dashboard, Semantic Models, Data Federation, Data Browser, MCP Access, Testing) so users understand the product before diving into configuration.
- **Remove all em-dashes**: Replace every em-dash character in README.md and all docs `.mdx` files with appropriate alternatives (commas, colons, parentheses, or "---" for table placeholders).
- **README-docs alignment**: Update the README Quick Start to match the docs' installation guide (standalone mode as primary, Docker Compose as recommended for production). Fix inconsistencies in default values and parameter descriptions.
- **Fix .env.example**: Mark `MONGODB_URI` as optional (not "Required") since Docker embeds it automatically.

## Impact

- Affected specs: `documentation-site`, `deployment`
- Affected code: `README.md`, `.env.example`, all `.mdx` files under `apps/docs/src/content/docs/`
- No API, schema, or behavioral changes. Documentation-only.
