# document-uploads Specification

## Purpose
TBD - created by archiving change add-document-uploads. Update Purpose after archive.
## Requirements
### Requirement: Document Storage

The system SHALL store uploaded documents on the local filesystem at `<SEMLAYER_DATA_DIR>/<projectId>/uploads/<filename>`. The `uploads/` directory SHALL be created automatically on first upload. Filenames SHALL be sanitized to alphanumeric characters, hyphens, underscores, and dots. Uploading a file with the same name as an existing file SHALL overwrite the previous file.

#### Scenario: First upload creates directory
- **WHEN** a document is uploaded to a project that has no prior uploads
- **THEN** the `uploads/` directory is created under the project's data directory
- **AND** the file is stored at `<SEMLAYER_DATA_DIR>/<projectId>/uploads/<sanitized-filename>`

#### Scenario: Filename sanitization
- **WHEN** a document is uploaded with a filename containing spaces or special characters
- **THEN** unsafe characters are replaced with hyphens
- **AND** the sanitized filename is returned in the API response

#### Scenario: Overwrite existing file
- **WHEN** a document is uploaded with the same name as an existing uploaded document
- **THEN** the existing file is replaced with the new content

### Requirement: Document Upload API

The API SHALL expose a `POST /api/projects/:projectId/documents/upload` endpoint that accepts multipart form data with a single file field. The endpoint SHALL enforce a maximum file size of 20 MB. The endpoint SHALL return the stored filename, size, and MIME type on success.

#### Scenario: Upload a PDF document
- **WHEN** a valid PDF file under 20 MB is uploaded via multipart form data
- **THEN** the file is stored in the project's `uploads/` directory
- **AND** the response includes `{ filename, size, mimeType }`

#### Scenario: Upload exceeds size limit
- **WHEN** a file larger than 20 MB is uploaded
- **THEN** a 413 error is returned with a descriptive message
- **AND** no file is written to disk

#### Scenario: No file provided
- **WHEN** the upload request contains no file field
- **THEN** a 400 error is returned

### Requirement: Document List API

The API SHALL expose a `GET /api/projects/:projectId/documents` endpoint that returns all uploaded documents for the project. Each entry SHALL include the filename, size in bytes, MIME type, and last modified timestamp.

#### Scenario: List documents for a project
- **WHEN** the list endpoint is called for a project with uploaded documents
- **THEN** an array of document metadata objects is returned
- **AND** each object includes `filename`, `size`, `mimeType`, and `lastModified`

#### Scenario: List documents for empty project
- **WHEN** the list endpoint is called for a project with no uploads
- **THEN** an empty array is returned

### Requirement: Document Delete API

The API SHALL expose a `DELETE /api/projects/:projectId/documents/:filename` endpoint that removes an uploaded document from disk.

#### Scenario: Delete an existing document
- **WHEN** a valid filename is provided to the delete endpoint
- **THEN** the file is removed from the `uploads/` directory
- **AND** a 200 response is returned

#### Scenario: Delete a non-existent document
- **WHEN** the filename does not match any uploaded document
- **THEN** a 404 error is returned

### Requirement: Document-to-Markdown Conversion

The system SHALL convert uploaded documents to markdown using `markitdown-ts` at read time. Supported input formats SHALL include at minimum: PDF, DOCX, XLSX, CSV, TXT, MD, and HTML. The conversion SHALL be invoked by the deep agent's `read_document` tool.

#### Scenario: Convert a PDF to markdown
- **WHEN** `read_document` is invoked for an uploaded PDF
- **THEN** the file is read from disk and converted to markdown via `markitdown-ts`
- **AND** the markdown text is returned

#### Scenario: Convert an XLSX to markdown
- **WHEN** `read_document` is invoked for an uploaded Excel spreadsheet
- **THEN** the spreadsheet content is converted to markdown tables
- **AND** the markdown text is returned

#### Scenario: Read a plain text file
- **WHEN** `read_document` is invoked for an uploaded `.txt` or `.md` file
- **THEN** the file content is returned as-is (no conversion needed)

#### Scenario: Unsupported file format
- **WHEN** `read_document` is invoked for a file format not supported by `markitdown-ts`
- **THEN** an error message is returned indicating the format is not supported

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

### Requirement: Document Upload UI

The frontend SHALL provide a UI for uploading documents within a project. The UI SHALL support drag-and-drop file selection and a file picker button. Uploaded documents SHALL be displayed in a list showing filename, size, type, and a delete action. The upload UI SHALL be accessible from the project's page.

#### Scenario: User uploads via drag-and-drop
- **WHEN** the user drags a file onto the upload area
- **THEN** the file is uploaded to the API
- **AND** the document list refreshes to show the new file

#### Scenario: User uploads via file picker
- **WHEN** the user clicks the upload button and selects a file
- **THEN** the file is uploaded to the API
- **AND** the document list refreshes to show the new file

#### Scenario: User deletes a document
- **WHEN** the user clicks the delete action on a document
- **THEN** a confirmation is shown
- **AND** on confirmation, the document is deleted via the API
- **AND** the document list refreshes

