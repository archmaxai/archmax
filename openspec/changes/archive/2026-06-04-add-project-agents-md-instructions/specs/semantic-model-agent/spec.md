## ADDED Requirements

### Requirement: Project Custom Instructions via AGENTS.md

The semantic-model authoring agent SHALL support an optional `AGENTS.md` file located at the project root (`<ARCHMAX_DATA_DIR>/projects/<projectId>/AGENTS.md`). The agent SHALL load this file using the Deep Agents library's built-in `memory` option (the path `AGENTS.md`, relative to the agent's project-scoped filesystem backend) rather than any bespoke file-reading code. When the file exists, its contents SHALL be injected into the agent's system prompt as project-specific instructions. When the file is absent, the agent SHALL start normally with no error. The agent's base system prompt SHALL include guidance describing the optional `AGENTS.md` and instructing the agent to follow any project-specific instructions found there.

#### Scenario: AGENTS.md present is loaded into instructions

- **WHEN** a project root contains an `AGENTS.md` file and the authoring agent is created for that project
- **THEN** the agent is configured with the Deep Agents `memory` source `AGENTS.md`
- **AND** the file's contents are present in the agent's composed system prompt

#### Scenario: AGENTS.md absent does not error

- **WHEN** a project root does not contain an `AGENTS.md` file and the authoring agent is created for that project
- **THEN** the agent is created successfully without throwing
- **AND** no project-instruction content is injected beyond the base system prompt guidance

#### Scenario: System prompt describes the AGENTS.md convention

- **WHEN** the authoring agent's base system prompt is composed
- **THEN** it includes guidance stating that an optional project-root `AGENTS.md` may contain project-specific instructions the agent must follow
