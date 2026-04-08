## 1. Backend — copy method and tool
- [x] 1.1 Add `copy(srcPath, destPath)` method to `ValidatingFilesystemBackend` with path validation, symlink check, and overwrite guard (uses `fs.cp` for recursive directory support)
- [x] 1.2 Add `makeCpTool()` factory function exposing the method as a `cp` LangChain tool (schema: `srcPath`, `destPath`, `recursive`)
- [x] 1.3 Register the cp tool in `createSemlayerAgent`
- [x] 1.4 Add unit tests for copy: file copy, directory copy (recursive), directory without recursive rejected, path traversal rejection, symlink rejection, target-already-exists rejection, source not found

## 2. Frontend — tool card visualization
- [x] 2.1 Add `cp` entry to `TOOL_META` in `tool-metadata.ts` with Copy icon and `"Copied x → y"` label
- [x] 2.2 Add `cp` case to `ExpandedContent` in `tool-expanded.tsx` showing source and destination paths
