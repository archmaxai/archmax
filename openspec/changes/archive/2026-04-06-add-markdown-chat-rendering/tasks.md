## 1. Dependencies
- [x] 1.1 Add `react-markdown` (^10) and `remark-gfm` (^4) to `apps/frontend/package.json`
- [x] 1.2 Run `pnpm install` and verify clean build

## 2. Markdown Component Map
- [x] 2.1 Create `apps/frontend/src/components/chat/markdown-components.tsx` with a `createMarkdownComponents()` factory returning custom Tailwind-styled renderers for: `code` (inline + block with copy button and language label), `p`, `ul`, `ol`, `li`, `h1`–`h4`, `a` (external links open in new tab), `blockquote`, `table`/`thead`/`tbody`/`tr`/`th`/`td`, `hr`, `strong`, `em`
- [x] 2.2 Code blocks: bordered container, optional language header bar, copy-to-clipboard button (hover reveal), monospace font

## 3. Integration
- [x] 3.1 Update `agent-chat.tsx` to import `ReactMarkdown`, `remarkGfm`, and the component map
- [x] 3.2 Replace the plain-text `<div className="whitespace-pre-wrap break-words">` for assistant messages with `<ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>`
- [x] 3.3 Keep user messages rendered as plain text (no markdown)
- [x] 3.4 Add `[&_p:first-child]:mt-0 [&_p:last-child]:mb-0` utility classes on the assistant bubble to suppress extra margin from `<p>` tags

## 4. Validation
- [ ] 4.1 Manual test: send a message that triggers a markdown-heavy response (headings, code block, table, list) and verify rendering
- [ ] 4.2 Verify code block copy button works
- [ ] 4.3 Verify streaming still works (tokens append correctly into markdown)
- [ ] 4.4 Verify dark mode renders correctly
