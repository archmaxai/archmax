## ADDED Requirements

### Requirement: Git Awareness in Agent Prompt

The semantic model agent system prompt SHALL include a section explaining that the project directory is a Git repository. The section SHALL explain: that changes are committed when the user publishes, that the project may be connected to a remote GitHub repository, that YAML files may contain Git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) after a sync operation, and how to identify and resolve conflicts by editing the files to remove the markers and keep the desired content.

#### Scenario: Agent understands Git context

- **WHEN** the agent receives a system prompt for a project
- **THEN** the prompt includes a section about Git versioning
- **AND** the section explains that publishing creates Git commits

#### Scenario: Agent recognizes conflict markers

- **WHEN** the agent reads a YAML file containing `<<<<<<<` conflict markers
- **THEN** the agent identifies the file as having merge conflicts
- **AND** the agent explains the conflict to the user and offers to resolve it

#### Scenario: Agent resolves a conflict

- **WHEN** the agent is asked to resolve a merge conflict in a YAML file
- **THEN** the agent reads the file, identifies the conflicting sections, proposes a resolution that preserves valid YAML structure, and writes the resolved file

### Requirement: Agent Revert Tools

The semantic model agent SHALL have access to Git revert tools: `revert_file` (restores a single file to its last committed state) and `discard_all_changes` (restores all files to the last committed state). These tools SHALL be described in the agent's system prompt and available as agent actions.

#### Scenario: Agent reverts a file

- **WHEN** the user asks the agent to undo changes to `sales.yaml`
- **THEN** the agent uses the `revert_file` tool to restore it to the last committed version
- **AND** the agent confirms the revert to the user

#### Scenario: Agent discards all changes

- **WHEN** the user asks the agent to discard all uncommitted changes
- **THEN** the agent uses the `discard_all_changes` tool to restore the working directory
- **AND** the agent confirms the discard to the user
