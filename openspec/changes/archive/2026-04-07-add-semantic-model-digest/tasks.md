## 1. Digest Service

- [x] 1.1 Create `packages/core/src/services/semantic-model-digest.ts` with `SemanticModelDigest` class (static `overview` and `dataset` methods)
- [x] 1.2 Implement helper functions: `formatField`, `oneLine`, `normalizeAiContext`, `parseCommonExtension`, `compactType`
- [x] 1.3 Write unit tests in `packages/core/src/services/semantic-model-digest.test.ts` covering: overview output, dataset pagination, field formatting with all optional segments, passthrough expression omission, COMMON extension parsing

## 2. MCP Tool Migration

- [x] 2.1 Add `get_semantic_model_overview` tool to `semlayer-server.ts` using `SemanticModelDigest.overview()`
- [x] 2.2 Add `get_dataset_fields` tool to `semlayer-server.ts` with `page` parameter using `SemanticModelDigest.dataset()`
- [x] 2.3 Remove old `get_semantic_model` and `describe_dataset` tools
- [x] 2.4 Update `getToolSchema` and `getToolRequired` for the new tool signatures

## 3. Validation

- [x] 3.1 Run digest against the real Shopify model and verify completeness (no information loss vs raw YAML)
- [x] 3.2 Verify MCP endpoint still works end-to-end with the new tools
