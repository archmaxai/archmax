# Change: Add markdown rendering to chat message bubbles

## Why
Assistant messages from the semantic model agent contain markdown (headings, lists, code blocks, tables, bold/italic) but are currently rendered as plain text with `whitespace-pre-wrap`. This makes responses hard to read — code fences show as raw backticks, tables render as pipe-delimited text, and structure is lost. The sibling project `archmax_chat` already solves this with `react-markdown` + `remark-gfm` and a custom Tailwind-styled component map; we should adopt the same approach.

## What Changes
- **Frontend**: Add `react-markdown` and `remark-gfm` dependencies to `@semlayer/frontend`
- **Frontend**: Create a `markdown-components.tsx` file with a custom component map (code blocks with copy button, headings, lists, tables, blockquotes, links, emphasis) — simplified from `archmax_chat` (no artifacts, workspace files, i18n, or xlsx export)
- **Frontend**: Update `agent-chat.tsx` to render assistant message content through `ReactMarkdown` instead of a plain `div` with `whitespace-pre-wrap`
- **Frontend**: Keep user messages as plain text (they are short prompts, not markdown)

## Impact
- Affected specs: `semantic-model-agent` (Chat Interface requirement)
- Affected code:
  - `apps/frontend/package.json` — new dependencies
  - `apps/frontend/src/components/chat/agent-chat.tsx` — swap plain text for `ReactMarkdown`
  - `apps/frontend/src/components/chat/markdown-components.tsx` — new file, custom component map
- Overlap: The `add-streaming-chat` change also proposes markdown rendering as one of many items. This focused change can land independently and the streaming change can drop its markdown bullet when it is implemented.
