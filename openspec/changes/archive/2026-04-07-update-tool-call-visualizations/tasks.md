## 1. SQL Syntax Highlighting

- [ ] 1.1 Add `shiki` dependency to `apps/frontend/package.json`
- [ ] 1.2 Create a lazy-loaded shiki highlighter utility (`apps/frontend/src/lib/shiki.ts`) that initializes a singleton with only the `sql` grammar and a `css-variables` theme (or `github-dark` / `github-light` dual theme)
- [ ] 1.3 Create a `SqlHighlight` React component that accepts a SQL string, calls the shiki highlighter, and renders the tokenized HTML with Tailwind-compatible styling
- [ ] 1.4 Replace the plain `<pre>` SQL block in `ExecuteQueryContent` (`tool-call-card.tsx`) with the `SqlHighlight` component; show the plain `<pre>` as fallback while shiki loads
- [ ] 1.5 Add CSS variables for shiki token colors in `globals.css` that respect dark/light mode

## 2. write_todos Visualization

- [ ] 2.1 Add `write_todos` entry to `TOOL_META` in `tool-call-card.tsx` with a `ListTodo` icon and contextual label ("Planning…" while running, "Updated plan" when completed)
- [ ] 2.2 Create `WriteTodosContent` component that parses the nested JSON args (`{input: "{\"todos\":[...]}"}`) and renders a styled checklist
- [ ] 2.3 Render each todo item with a status icon: `Check` (completed), `Circle` (pending), `Loader2` animated (in-progress), and the item's content text
- [ ] 2.4 Handle parsing failures gracefully — fall back to the default raw JSON renderer if the args don't match the expected format

## 3. Streaming Progress Bar

- [ ] 3.1 Create `StreamingBar` component (`apps/frontend/src/components/chat/streaming-bar.tsx`) with a CSS-animated glowing bar: sweeping gradient (purple → blue → purple), outer glow via box-shadow, and a shimmer overlay
- [ ] 3.2 Add CSS custom properties and `@keyframes` for the streaming bar animation in `globals.css` (`--stream-purple`, `--stream-blue`, sweep animation, shimmer)
- [ ] 3.3 Implement enter/exit transitions: bar fades in on mount, fades out and shrinks when `active` prop becomes false, then unmounts
- [ ] 3.4 Replace the `<Loader2>` spinner "Thinking…" indicator in `agent-chat.tsx` with the `StreamingBar` component, rendered below the assistant message while `isStreaming` is true
- [ ] 3.5 Respect `prefers-reduced-motion`: disable animation and show a static muted bar instead

## 4. Validation

- [ ] 4.1 Manual test: expand an `executeQuery` card and verify SQL keywords are highlighted in distinct colors
- [ ] 4.2 Manual test: trigger a `write_todos` tool call and verify the todo list renders as a checklist with status icons
- [ ] 4.3 Manual test: send a message and verify the streaming bar appears while the agent works and fades out when done
- [ ] 4.4 Manual test: verify dark mode and light mode both render correctly for all three features
