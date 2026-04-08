## 1. Backend — rename method and tool
- [x] 1.1 Add `rename(oldPath, newPath)` method to `ValidatingFilesystemBackend` with path validation, symlink check, and overwrite guard
- [x] 1.2 Add `makeRenameTool()` factory function exposing the method as a `rename` LangChain tool (schema: `oldPath`, `newPath`)
- [x] 1.3 Register the rename tool in `createSemlayerAgent`
- [x] 1.4 Add unit tests for rename: success, path traversal rejection, symlink rejection, target-already-exists rejection, source not found

## 2. Frontend — tool card visualization
- [x] 2.1 Add `rename` entry to `TOOL_META` in `tool-call-card.tsx` with a file-move icon and `"Renamed x → y"` label
- [x] 2.2 Add `rename` case to `ExpandedContent` showing old and new paths

## 3. Spec update
- [x] 3.1 Update `Filesystem tool visualization` scenario to include `rename` in the tool list
