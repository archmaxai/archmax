## MODIFIED Requirements

### Requirement: Deep Agent Backend

The API SHALL expose a streaming endpoint for the semantic model agent. The agent uses LangChain Deep Agents with `FilesystemBackend({ rootDir: "<SEMLAYER_DATA_DIR>/<projectId>", virtualMode: true })`, giving it sandboxed filesystem access to the project's YAML files. The agent system prompt SHALL document the OSI-compliant YAML schema including: snake_case keys (`ai_context`, `primary_key`, `unique_keys`, `from_columns`, `to_columns`), the OSI Expression object format (`{ dialects: [{ dialect: ANSI_SQL, expression: "..." }] }`), `custom_extensions` for project-specific field metadata (`data_type`, `example_data`, `distinct_values` under `vendor_name: COMMON`), and the `dimension` property with `is_time` for temporal fields. The agent SHALL also have access to a `read_document` tool that reads uploaded documents from the project's `uploads/` directory and returns their content as markdown, enabling the agent to reference data dictionaries, ERDs, business glossaries, and other supplementary documentation when building semantic models.

#### Scenario: Agent lists semantic models
- **WHEN** the user asks "What semantic models exist?"
- **THEN** the agent uses the `ls` filesystem tool to list YAML files in the project directory
- **AND** returns a summary to the user

#### Scenario: Agent creates a new semantic model
- **WHEN** the user asks "Create a model for the orders schema"
- **THEN** the agent uses `write_file` to create a new YAML file conforming to the OSI schema with snake_case keys and Expression objects
- **AND** the file is written to `<SEMLAYER_DATA_DIR>/<projectId>/<model-name>.yaml`

#### Scenario: Agent writes fields with extensions
- **WHEN** the agent creates a dataset with fields that have data types and example data
- **THEN** the field's `data_type`, `example_data`, and `distinct_values` are placed in `custom_extensions` with `vendor_name: COMMON`
- **AND** timestamp/date fields include `dimension: { is_time: true }`

#### Scenario: Agent reads an uploaded document
- **WHEN** the user says "Use the data dictionary PDF to create the model"
- **THEN** the agent invokes `read_document` with the PDF filename
- **AND** receives the document content as markdown
- **AND** uses the extracted information to inform semantic model creation
