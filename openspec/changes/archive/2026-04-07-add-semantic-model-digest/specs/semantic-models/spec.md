## ADDED Requirements

### Requirement: Semantic Model Digest Service

The system SHALL provide a `SemanticModelDigest` class in `@semlayer/core` that compiles parsed `SemanticModel` and `Dataset` objects into compact markdown text optimized for LLM consumption. The digest is a read-only view — the YAML files remain the authoritative source of truth. The class SHALL expose two static methods:

- `overview(model)` — Returns a markdown string containing: model name and description, ai_context instructions as a blockquote, a dataset summary table (name, source, field count, description), relationship join paths (`from.column → to.column`), and a metrics table (name, expression, description).
- `dataset(dataset, page?)` — Returns a paginated markdown string (default page size: 25 fields) containing: dataset name, source, description, primary key, ai_context (synonyms as aliases, instructions as blockquote), and a field list where each field is a single compact line with: name, data type, description, example data, and optional segments for enum values, computed expressions, synonyms, and instructions.

#### Scenario: Overview of a model with datasets, relationships, and metrics
- **WHEN** `SemanticModelDigest.overview(model)` is called on a model with 15 datasets, 12 relationships, and 20 metrics
- **THEN** a markdown string is returned with a dataset summary table, relationship list, and metrics table
- **AND** the output is approximately 3x smaller in token count than the equivalent raw JSON

#### Scenario: Dataset digest includes all field metadata inline
- **WHEN** `SemanticModelDigest.dataset(dataset)` is called on a dataset with fields containing types, examples, enums, synonyms, and instructions
- **THEN** each field is rendered as a single compact line in the format: `- **name** \`TYPE\` {enums} — Description. Expr: \`...\`. Ex: \`val1\`, \`val2\` | _synonyms_ | Note: instructions`
- **AND** optional segments (enums, expression, synonyms, instructions) are omitted when the field has no such data

#### Scenario: Dataset digest pagination
- **WHEN** `SemanticModelDigest.dataset(dataset, 2)` is called on a dataset with 40 fields
- **THEN** fields 26–40 are returned
- **AND** the header indicates `page 2/2`
- **AND** no "next page" hint is shown

#### Scenario: Dataset digest with fewer fields than page size
- **WHEN** `SemanticModelDigest.dataset(dataset)` is called on a dataset with 10 fields
- **THEN** all 10 fields are returned on page 1/1
- **AND** no pagination hint is shown

#### Scenario: Passthrough field expressions are omitted
- **WHEN** a field has `expression: "id"` and `name: "id"` (expression equals field name)
- **THEN** the `Expr: ...` segment is omitted from the digest line to reduce noise

#### Scenario: COMMON extension data is inlined
- **WHEN** a field has `custom_extensions: [{ vendor_name: "COMMON", data: '{"data_type":"VARCHAR","example_data":["paid"],"distinct_values":["paid","pending"]}' }]`
- **THEN** the type shows as `VARCHAR`, examples show as `Ex: \`paid\``, and enums show as `{paid, pending}`
- **AND** the raw custom_extensions wrapper structure is not exposed in the output
