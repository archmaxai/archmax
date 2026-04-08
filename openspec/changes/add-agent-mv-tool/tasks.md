## 1. Backend — mv method and tool
- [ ] 1.1 Add `mv(oldPath, newPath)` method to `ValidatingFilesystemBackend` with path validation, symlink check, and overwrite guard
- [ ] 1.2 Add `makeMvTool()` factory function exposing the method as a `mv` LangChain tool (schema: `oldPath`, `newPath`)
- [ ] 1.3 Register the mv tool in `createSemlayerAgent`
- [ ] 1.4 Add unit tests for mv: success, path traversal rejection, symlink rejection, target-already-exists rejection, source not found

## 2. Frontend — tool card visualization
- [ ] 2.1 Add `mv` entry to `TOOL_META` in `tool-call-card.tsx` with a file-move icon and `"Moved x → y"` label
- [ ] 2.2 Add `mv` case to `ExpandedContent` showing old and new paths

## 3. Spec update
- [ ] 3.1 Update `Filesystem tool visualization` scenario to include `mv` in the tool list
