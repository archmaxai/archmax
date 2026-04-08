## 1. Agent Prompt — Add Validated Query Workflow Step

- [x] 1.1 Add a new step 9 "Generate Validated Queries" to `packages/core/prompts/semantic-model-agent.md` describing the dataset-level and model-level query generation process
- [x] 1.2 Add a "Validated Queries" section to the YAML Schema Reference showing the COMMON extension structure with `validated_queries`
- [x] 1.3 Add rule #11 to "Important Rules" instructing the agent to validate every query via `executeQuery` before writing it

## 2. Digest Service — Surface Validated Queries

- [x] 2.1 Add `parseValidatedQueries()` helper to `packages/core/src/services/semantic-model-digest.ts` that extracts `validated_queries` from COMMON custom extension on any entity
- [x] 2.2 Update `SemanticModelDigest.overview()` to append a "Validated Queries" section when the model has validated queries
- [x] 2.3 Update `SemanticModelDigest.dataset()` to append a "Validated Queries" section after the fields list when the dataset has validated queries
- [x] 2.4 Add unit tests for digest output with and without validated queries in `semantic-model-digest.test.ts`
