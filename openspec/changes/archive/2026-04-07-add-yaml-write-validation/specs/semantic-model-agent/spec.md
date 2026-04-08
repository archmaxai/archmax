## ADDED Requirements
### Requirement: YAML Syntax Validation on Write

The agent's filesystem backend SHALL validate YAML syntax before persisting any file whose path ends in `.yaml` or `.yml`. When the content is not valid YAML, the `write_file` tool MUST return an error describing the syntax issue instead of writing the file to disk. When an `edit_file` operation on a YAML file produces syntactically invalid content, the tool MUST return an error describing the issue so the agent can self-correct.

#### Scenario: write_file with valid YAML succeeds
- **WHEN** the agent invokes `write_file` with a `.yaml` path and syntactically valid YAML content
- **THEN** the file is written to disk as normal
- **AND** the tool returns a success result

#### Scenario: write_file with invalid YAML returns error
- **WHEN** the agent invokes `write_file` with a `.yaml` path and content that is not valid YAML (e.g. bad indentation, unmatched quotes)
- **THEN** the file is NOT written to disk
- **AND** the tool returns an error containing the YAML parse error message
- **AND** the agent can use the error to fix the content and retry

#### Scenario: edit_file producing invalid YAML returns error
- **WHEN** the agent invokes `edit_file` on a `.yaml` file and the resulting content after the edit is not valid YAML
- **THEN** the tool returns an error describing the YAML syntax issue
- **AND** the agent can use the error to correct the edit

#### Scenario: Non-YAML files are not validated
- **WHEN** the agent invokes `write_file` or `edit_file` on a file that does not end in `.yaml` or `.yml` (e.g. `.md`, `.txt`)
- **THEN** no YAML validation is performed
- **AND** the file is written or edited as normal
