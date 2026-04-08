## Context

AI agents that consume semantic models via MCP tools receive raw JSON blobs serialized from the YAML files. The structural overhead of OSI-compliant YAML (nested expression objects, custom_extensions wrappers, vendor_name boilerplate) dominates the token budget while carrying minimal semantic value for an agent that needs to construct SQL queries.

This change introduces a compilation step between the YAML source of truth and what the MCP tools return — converting structured YAML into dense, scannable markdown optimized for LLM consumption.

## Goals / Non-Goals

- Goals:
  - 3x+ token reduction for semantic model consumption via MCP
  - Preserve all field-level information (types, examples, enums, synonyms, instructions, computed expressions)
  - Paginate large datasets so agents only fetch what they need
  - Keep the YAML files as the authoritative source — digest is a read-only view

- Non-Goals:
  - Changing the YAML file format or storage
  - Modifying the semantic-model-agent's filesystem tools (it still reads/writes raw YAML)
  - Building a search/filter API over fields

## Decisions

### Two-layer digest (not three)

- **Decision**: Overview + Dataset (with all field metadata inline), no separate field-detail layer
- **Rationale**: A third "field detail" layer adds an extra tool call round trip for information that can be packed into the dataset layer. Example data, instructions, and enum values fit naturally into a compact one-line-per-field list format. The agent almost never needs a single field in isolation — it needs to scan available fields to pick columns for a query.

### Compact list format (not markdown table)

- **Decision**: Use a bullet list per field rather than a markdown table
- **Rationale**: A table forces fixed columns, wasting space on empty cells (most fields have no synonyms or instructions) or truncating important data. A list format is variable-length — simple fields are one line, complex fields get extra segments. Format per field:
  ```
  - **name** `TYPE` {enum values} — Description. Expr: `...`. Ex: `val1`, `val2` | _synonym1, synonym2_ | Note: instructions
  ```
  Each segment is only included when it has content.

### Pagination at 25 fields per page

- **Decision**: Default page size of 25 fields
- **Rationale**: Most datasets have 15–40 fields. 25 keeps a typical dataset on one page while splitting unusually wide tables. The agent sees a "request page N" hint and can fetch more if needed.

### Markdown text output (not JSON)

- **Decision**: MCP tools return plain markdown text, not JSON
- **Rationale**: LLMs parse markdown natively. JSON carries quoting overhead and structural noise that the model must parse. Markdown is the natural format for information the LLM should *read*, while JSON is appropriate for information the LLM should *manipulate*.

## Token Analysis (Shopify `customers` dataset, 19 fields)

| Format | Lines | ~Tokens |
|--------|-------|---------|
| Raw YAML | 244 | ~1,800 |
| Raw JSON (current `get_semantic_model`) | ~200 | ~1,500 |
| Markdown digest | ~30 | ~550 |

For the full Shopify model (15 datasets, 20 metrics, 12 relationships): overview alone is ~300 tokens vs ~8,000+ for the full JSON dump. The agent can then selectively fetch individual datasets as needed.

## Risks / Trade-offs

- **Information fidelity**: The digest is a lossy view — it omits the OSI expression wrapper structure and custom_extensions envelope. If a consumer needs the raw structure, the existing `getRawYaml()` method on `SemanticModelFileService` remains available.
- **Format coupling**: The markdown format is not machine-parseable back into structured data. This is intentional — the digest is for LLM consumption, not for round-tripping.
- **Breaking MCP change**: Existing MCP consumers relying on `get_semantic_model` JSON output will break. Acceptable because the only consumers are AI agents, and the new format is strictly better for them.

## Open Questions

- Should we keep the old JSON tools alongside the new digest tools for backward compatibility, or replace them outright?
