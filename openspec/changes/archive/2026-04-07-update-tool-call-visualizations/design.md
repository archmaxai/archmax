## Context

The `executeQuery` tool card already shows SQL in a `<pre>` block. Adding syntax highlighting requires a tokenizer. The streaming progress indicator needs a visible animation to replace the current `<Loader2>` spinner.

## Goals / Non-Goals
- Goals:
  - Add SQL syntax highlighting to executeQuery expanded view
  - Render `write_todos` tool calls as a formatted checklist
  - Show a glowing streaming progress bar while the agent is working
- Non-Goals:
  - Full syntax highlighting for all markdown code blocks (future improvement)
  - Rewriting the SSE event protocol
  - Adding GSAP or heavy animation libraries

## Decisions

### SQL Highlighting: shiki (lazy-loaded, SQL grammar only)

- **Decision**: Use `shiki` for SQL syntax highlighting, loaded lazily with only the `sql` grammar and a single theme.
- **Alternatives considered**:
  - `highlight.js` / `react-syntax-highlighter` — heavier bundle, less modern, PrismJS themes don't match Tailwind well
  - CSS-only regex tokenizer — fragile for SQL, poor edge-case handling
  - `prism-react-renderer` — decent but `shiki` produces higher-quality output and is the modern standard
- **Rationale**: `shiki` uses TextMate grammars (same as VS Code), supports fine-grained lazy loading, and produces pre-tokenized HTML that doesn't need a runtime parser. Loading only the `sql` grammar keeps the bundle small (~50KB gzipped). The highlighted HTML integrates cleanly with Tailwind's dark mode via shiki's `css-variables` theme.

### Streaming Progress Bar: CSS-only animation

- **Decision**: Implement the streaming bar with pure CSS animations (keyframes + custom properties), no GSAP.
- **Alternatives considered**:
  - GSAP (as in archmax_chat) — adds a ~30KB dependency for one animation; overkill
  - Framer Motion — already not in the project, large bundle
- **Rationale**: A CSS `@keyframes` animation with `background-position` sweep and `box-shadow` glow achieves the same visual effect as archmax_chat's `StreamingDot` without adding any runtime dependency. The animation uses `will-change: background-position` for GPU compositing.

### write_todos Renderer: Parse nested JSON, render as checklist

- **Decision**: Parse the double-encoded JSON in `write_todos` args (`{input: "{\"todos\":[...]}"}`) and render as a styled list with status icons.
- **Rationale**: The deep agent's `write_todos` tool uses a nested JSON format. Parsing it and showing a checklist is straightforward and dramatically more readable than raw JSON.

## Risks / Trade-offs
- `shiki` WASM loading adds a small first-paint delay (~100ms) on first `executeQuery` expand — mitigated by lazy initialization and caching the highlighter instance
- If the deep agent changes the `write_todos` arg format, the renderer falls back to the default raw JSON view (graceful degradation)

## Open Questions
- None — scope is tightly contained to frontend rendering changes
