## 1. Backend — mv method and tool
- [x] 1.1 Add `mv(oldPath, newPath)` method to `ValidatingFilesystemBackend` with path validation, symlink check, and overwrite guard
- [x] 1.2 Add `makeMvTool()` factory function exposing the method as a `mv` LangChain tool (schema: `oldPath`, `newPath`)
- [x] 1.3 Register the mv tool in `createSemlayerAgent`
- [x] 1.4 Add unit tests for mv: success, path traversal rejection, symlink rejection, target-already-exists rejection, source not found

## 2. Frontend — tool card visualization
- [x] 2.1 Add `mv` entry to `TOOL_META` in `tool-metadata.ts` with a file-move icon and `"Moved x → y"` label
- [x] 2.2 Add `mv` case to `ExpandedContent` showing old and new paths

## 3. Spec update
- [x] 3.1 Update `Filesystem tool visualization` scenario to include `mv` in the tool list
