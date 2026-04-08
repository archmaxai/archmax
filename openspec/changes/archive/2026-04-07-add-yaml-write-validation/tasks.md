## 1. Implementation
- [x] 1.1 Create `ValidatingFilesystemBackend` that extends `FilesystemBackend` in `packages/core/src/services/agent.ts`
- [x] 1.2 Override `write()` — when file path ends with `.yaml`/`.yml`, parse content with `yaml.load()` from `js-yaml`; if it throws a `YAMLException`, return `{ error: "YAML syntax error: <message>" }` without writing; otherwise delegate to `super.write()`
- [x] 1.3 Override `edit()` — delegate to `super.edit()`, then if the file is `.yaml`/`.yml` and the edit succeeded, read back the file content and validate with `yaml.load()`; if invalid, return an `EditResult` with an error message describing the syntax issue
- [x] 1.4 Replace `new FilesystemBackend(...)` with `new ValidatingFilesystemBackend(...)` in `createSemlayerAgent`

## 2. Validation
- [ ] 2.1 Manual smoke test: trigger the agent to write intentionally malformed YAML and verify the error is returned to the agent (the agent should self-correct)
