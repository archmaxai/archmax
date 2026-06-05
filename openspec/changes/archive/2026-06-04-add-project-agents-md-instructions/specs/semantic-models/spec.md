## REMOVED Requirements

### Requirement: AGENTS.md Auto-Generation

**Reason**: The auto-generated `AGENTS.md` summary was written to the project root after every `write()`/`delete()` but was never read by any code path (no agent, MCP tool, or API consumed it). The project-root `AGENTS.md` slot is being repurposed for optional user-authored agent instructions loaded via the Deep Agents `memory` feature (see `semantic-model-agent` → "Project Custom Instructions via AGENTS.md").

**Migration**: Remove `regenerateAgentsMd` and its call sites in `SemanticModelFileService.write()` and `delete()`. Pre-existing auto-generated files are removed on startup (see "Legacy Auto-Generated AGENTS.md Cleanup") so the stale summary does not get injected as agent instructions; user-authored files are preserved.

## ADDED Requirements

### Requirement: Legacy Auto-Generated AGENTS.md Cleanup

On application startup, the system SHALL remove any project-root `AGENTS.md` file that was produced by the former auto-generator, identified by its generated header signature (the file begins with `# Semantic Models`). Files at the project root that do not match this signature (i.e. user-authored `AGENTS.md`) SHALL be left untouched. The cleanup SHALL be idempotent and SHALL run per existing project directory.

#### Scenario: Auto-generated file is removed

- **WHEN** a project root contains an `AGENTS.md` whose content begins with `# Semantic Models`
- **THEN** startup removes that `AGENTS.md` file

#### Scenario: User-authored file is preserved

- **WHEN** a project root contains an `AGENTS.md` whose content does not begin with `# Semantic Models`
- **THEN** startup leaves the file unchanged

#### Scenario: Cleanup is idempotent

- **WHEN** startup runs again on a project whose `AGENTS.md` was already removed or never existed
- **THEN** no error occurs and no file is created
