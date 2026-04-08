## MODIFIED Requirements

### Requirement: Agent read_document Tool

The deep agent SHALL have access to a `read_document` tool that reads an uploaded document and returns its content as markdown. When called without a `filename` parameter, the tool SHALL return a list of available documents in the project's `uploads/` directory. The agent system prompt SHALL mention the existence of uploaded documents and the `read_document` tool. The MCP server SHALL NOT expose `list_documents` or `read_document` as MCP tools — document access via MCP is not supported. Document reading is only available to the deep agent internally.

#### Scenario: Agent reads a document by filename
- **WHEN** the agent invokes `read_document` with `{ "filename": "data-dictionary.pdf" }`
- **THEN** the PDF is converted to markdown and returned as the tool result

#### Scenario: Agent lists available documents
- **WHEN** the agent invokes `read_document` without a filename (or with an empty string)
- **THEN** a list of uploaded filenames with sizes and types is returned

#### Scenario: Agent requests a non-existent document
- **WHEN** the agent invokes `read_document` with a filename that does not exist
- **THEN** an error message is returned listing the available documents

#### Scenario: No document tools on MCP server
- **WHEN** an MCP client calls `tools/list`
- **THEN** neither `list_documents` nor `read_document` is present in the response
- **AND** document access remains available only through the deep agent's internal tooling
