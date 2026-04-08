## Context

The semantic model agent has sandboxed filesystem access to `<SEMLAYER_DATA_DIR>/<projectId>/` via `FilesystemBackend`. Users want to provide supplementary documents (PDFs, spreadsheets, Word docs) that the agent can read to improve semantic model creation — e.g. data dictionaries, ERDs, business glossaries.

The archmax_chat project uses a manual approach (pdf-parse + jszip for OOXML XML extraction). Instead, we adopt `markitdown-ts` — a single library that converts PDF, DOCX, XLSX, HTML, CSV, images, and more into clean markdown. This is simpler and produces better output than raw XML extraction.

## Goals / Non-Goals

- Goals:
  - Users can upload documents to a project via the admin UI
  - The deep agent can read any uploaded document as markdown via a dedicated tool
  - Supported formats: PDF, DOCX, XLSX, CSV, TXT, MD, HTML, images (metadata)
  - File size limits enforced at the API level

- Non-Goals:
  - Full-text search across uploaded documents
  - OCR for scanned PDFs (markitdown-ts extracts embedded text only)
  - S3/cloud storage — files stay on the local filesystem like semantic models
  - Versioning or edit history of uploaded documents
  - Real-time collaboration on documents

## Decisions

### Storage: Local filesystem under `uploads/`

**Decision**: Store uploaded files at `<SEMLAYER_DATA_DIR>/<projectId>/uploads/<filename>`.

**Rationale**: Consistent with how semantic model YAML files are stored (local FS under `SEMLAYER_DATA_DIR`). No new infrastructure needed. The Docker volume that backs `SEMLAYER_DATA_DIR` already persists data.

**Alternatives considered**:
- S3/MinIO: Adds infrastructure complexity for a single-user system. Rejected.
- MongoDB GridFS: Adds latency and query complexity. Rejected.

### Conversion: `markitdown-ts`

**Decision**: Use `markitdown-ts` (npm) for document-to-markdown conversion at read time (not at upload time).

**Rationale**: Convert on read avoids storing duplicate data and naturally supports library upgrades improving output. The library handles PDF, DOCX, XLSX, HTML, CSV, images, and more in a single call. Lazy conversion is acceptable because documents are typically small (<10 MB) and read infrequently.

**Alternatives considered**:
- Convert at upload time: Simpler reads but stale conversions when library improves. Hybrid could be added later.
- Manual pdf-parse + jszip (archmax_chat approach): More code, worse output quality for XLSX/DOCX. Rejected.

### Agent integration: Dedicated `read_document` tool (not filesystem `read_file`)

**Decision**: Add a separate `read_document` tool rather than making `read_file` aware of binary formats.

**Rationale**: The `FilesystemBackend` `read_file` returns raw text content — feeding binary PDF bytes into it would produce garbage. A dedicated tool with clear semantics (`read_document` → markdown) is cleaner. The tool lists available documents when called without arguments, making it discoverable.

### File size limit: 20 MB

**Decision**: Reject uploads larger than 20 MB at the API level.

**Rationale**: markitdown-ts processes files in memory. 20 MB is generous for data dictionaries and documentation while preventing accidental large uploads.

## Risks / Trade-offs

- **Conversion quality**: markitdown-ts may not perfectly render complex XLSX layouts or heavily formatted PDFs. Mitigation: acceptable for agent consumption where content matters more than formatting.
- **Memory usage**: Large files are converted in-memory. Mitigation: 20 MB limit keeps peak usage bounded.
- **Filename collisions**: Uploading a file with the same name overwrites the previous one. This is intentional (simple replace semantics), documented in the API.

## Open Questions

- Should the agent's `FilesystemBackend` `rootDir` be expanded to include `uploads/` in its virtual FS, or should `read_document` bypass the backend entirely? (Proposed: bypass, since `read_document` does conversion, not raw reads.)
