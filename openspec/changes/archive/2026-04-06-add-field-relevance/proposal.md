# Change: Add importance ordering convention for semantic model elements

## Why
When consuming semantic models downstream (MCP tools, UI, AI agents), there is no signal for which fields, datasets, metrics, or relationships matter most. Encoding importance as **array position** — most important items first — is zero-cost, human-readable, and requires no schema changes. For datasets (stored as separate files), a YAML comment in the root file expresses the ordering.

## What Changes
- Establish a convention: arrays of fields, metrics, and relationships SHALL be sorted by importance (most important first)
- Root model YAML files SHALL include a comment block listing dataset files in importance order
- Update the agent assembly prompt to instruct the agent to sort by importance and emit the dataset ordering comment
- This is a custom extension — not part of the OSI spec

## Impact
- Affected specs: `semantic-models` (ordering convention across Field, Metric, Relationship, Dataset)
- Affected code:
  - `packages/core/prompts/semantic-model-assembly.md` — agent prompt
